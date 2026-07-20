import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Json = Record<string, unknown>;
type Company = {
  id: string;
  ticker: string;
  company_name: string;
  edinet_code: string | null;
  industry_name: string | null;
  is_financial: boolean;
  listing_status: string | null;
};
type Analysis = {
  ticker: string;
  company_name: string;
  doc_id: string | null;
  financials: Json | null;
  history: Json[] | null;
};
type Period = {
  company_id: string;
  fiscal_year: number;
  period_end: string;
  document_id: string;
  financials: Json | null;
};
type Result = {
  ticker: string;
  companyName: string;
  beforeHistory: number;
  afterHistory: number;
  sourcePeriods: number;
  latestCorrected: boolean;
  status: "repaired" | "unchanged" | "insufficient-source" | "failed";
  zeroFieldsBefore?: string[];
  zeroFieldsAfter?: string[];
  invalidHistoryPeriods?: Array<{ period: string; fields: string[] }>;
  error?: string;
};

const concurrency = Math.max(1, Number(arg("concurrency") ?? "1"));
const onlyTicker = (arg("ticker") ?? "").trim().toUpperCase();
const dryRun = process.argv.includes("--dry-run");

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function historyCount(history: unknown) {
  return Array.isArray(history) ? history.filter(Boolean).length : 0;
}

function periodKey(row: Json) {
  return String(row.periodEnd ?? row.period_end ?? row.fiscalYear ?? row.fiscal_year ?? row.year ?? "");
}

function profile(company: Company): "bank" | "insurance" | "general" {
  const source = `${company.company_name} ${company.industry_name ?? ""}`;
  if (/銀行|信用金庫|bank/i.test(source)) return "bank";
  if (/保険|生命|損害|insurance/i.test(source)) return "insurance";
  return "general";
}

function requiredFields(company: Company) {
  const kind = profile(company);
  if (kind === "bank") {
    return ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "loans", "deposits"];
  }
  if (kind === "insurance") {
    return ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "policyReserves"];
  }
  return [
    "revenue",
    "operatingIncome",
    "operatingCF",
    "cash",
    "currentAssets",
    "currentLiabilities",
    "assets",
    "netAssets",
  ];
}

function invalidFields(company: Company, row: Json | null | undefined) {
  const source = row ?? {};
  return requiredFields(company).filter((key) => {
    const value = source[key];
    return !finite(value) || value === 0;
  });
}

function invalidHistory(company: Company, history: Json[] | null | undefined) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(Boolean)
    .map((row) => ({ period: periodKey(row), fields: invalidFields(company, row) }))
    .filter((row) => row.fields.length > 0);
}

function comparableValues(company: Company, row: Json | null | undefined) {
  const source = row ?? {};
  return Object.fromEntries(
    requiredFields(company).map((key) => [key, finite(source[key]) ? source[key] : null])
  ) as Record<string, number | null>;
}

function materiallyDifferent(company: Company, a: Json | null, b: Json | null) {
  if (!a || !b) return false;
  const left = comparableValues(company, a);
  const right = comparableValues(company, b);
  return Object.keys(left).some((key) => {
    const l = left[key];
    const r = right[key];
    if (l === null || r === null) return l !== r;
    const scale = Math.max(Math.abs(l), Math.abs(r), 1);
    return Math.abs(l - r) / scale > 0.000001;
  });
}

function uniquePeriods(rows: Period[]) {
  const byPeriod = new Map<string, Period>();
  for (const row of [...rows].sort((a, b) => b.period_end.localeCompare(a.period_end))) {
    const key = row.period_end || String(row.fiscal_year);
    if (!byPeriod.has(key)) byPeriod.set(key, row);
  }
  return [...byPeriod.values()].sort((a, b) => a.period_end.localeCompare(b.period_end));
}

function runAnalyze(company: Company, analysis: Analysis) {
  if (!analysis.doc_id) throw new Error("最新書類IDがありません");
  execFileSync("npx", ["tsx", "scripts/analyze-company.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      TICKER: company.ticker,
      COMPANY_NAME: company.company_name,
      DOC_ID: analysis.doc_id,
    },
  });
}

async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function loadState() {
  const [companies, analyses, periods] = await Promise.all([
    loadAllSupabaseRows<Company>("会社取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("id, ticker, company_name, edinet_code, industry_name, is_financial, listing_status")
        .eq("listing_status", "listed")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Analysis>("分析取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, doc_id, financials, history")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Period>("期間取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_financial_periods")
        .select("company_id, fiscal_year, period_end, document_id, financials")
        .order("period_end", { ascending: true })
        .range(from, to)
    ),
  ]);
  return { companies, analyses, periods };
}

async function main() {
  const before = await loadState();
  const analysisMap = new Map(before.analyses.map((row) => [row.ticker, row]));
  const periodsByCompany = new Map<string, Period[]>();
  for (const row of before.periods) {
    const current = periodsByCompany.get(row.company_id) ?? [];
    current.push(row);
    periodsByCompany.set(row.company_id, current);
  }

  const targets = before.companies.filter((company) => {
    if (onlyTicker && company.ticker !== onlyTicker) return false;
    const analysis = analysisMap.get(company.ticker);
    if (!analysis?.doc_id) return false;
    const periods = uniquePeriods(periodsByCompany.get(company.id) ?? []);
    const latestPeriod = periods.at(-1)?.financials ?? null;
    return (
      invalidFields(company, analysis.financials).length > 0 ||
      invalidHistory(company, analysis.history).length > 0 ||
      materiallyDifferent(company, analysis.financials, latestPeriod) ||
      historyCount(analysis.history) < 3
    );
  });

  console.log("===== 財務数値・3期履歴 統合修復 =====");
  console.log({ targets: targets.length, dryRun, concurrency, zeroRule: "必須項目が1つでも0なら異常" });

  const initial = new Map(
    targets.map((company) => {
      const analysis = analysisMap.get(company.ticker)!;
      return [company.ticker, {
        beforeHistory: historyCount(analysis.history),
        beforeFinancials: analysis.financials,
        zeroFieldsBefore: invalidFields(company, analysis.financials),
      }];
    })
  );

  if (!dryRun) {
    await mapConcurrent(targets, concurrency, async (company) => {
      const analysis = analysisMap.get(company.ticker)!;
      try {
        runAnalyze(company, analysis);
      } catch (error) {
        console.error(`[FAIL] ${company.ticker}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return company.ticker;
    });
  }

  const after = dryRun ? before : await loadState();
  const afterAnalysisMap = new Map(after.analyses.map((row) => [row.ticker, row]));
  const afterPeriodsByCompany = new Map<string, Period[]>();
  for (const row of after.periods) {
    const current = afterPeriodsByCompany.get(row.company_id) ?? [];
    current.push(row);
    afterPeriodsByCompany.set(row.company_id, current);
  }

  const results: Result[] = targets.map((company) => {
    const beforeRow = initial.get(company.ticker)!;
    const analysis = afterAnalysisMap.get(company.ticker);
    const sourcePeriods = uniquePeriods(afterPeriodsByCompany.get(company.id) ?? []).length;
    const afterHistory = historyCount(analysis?.history);
    const latestCorrected = materiallyDifferent(company, beforeRow.beforeFinancials, analysis?.financials ?? null);
    const zeroFieldsAfter = invalidFields(company, analysis?.financials);
    const invalidHistoryPeriods = invalidHistory(company, analysis?.history);

    if (!analysis) {
      return {
        ticker: company.ticker,
        companyName: company.company_name,
        beforeHistory: beforeRow.beforeHistory,
        afterHistory: 0,
        sourcePeriods,
        latestCorrected,
        zeroFieldsBefore: beforeRow.zeroFieldsBefore,
        zeroFieldsAfter,
        invalidHistoryPeriods,
        status: "failed",
        error: "更新後の分析データがありません",
      };
    }

    if (zeroFieldsAfter.length > 0) {
      return {
        ticker: company.ticker,
        companyName: company.company_name,
        beforeHistory: beforeRow.beforeHistory,
        afterHistory,
        sourcePeriods,
        latestCorrected,
        zeroFieldsBefore: beforeRow.zeroFieldsBefore,
        zeroFieldsAfter,
        invalidHistoryPeriods,
        status: "failed",
        error: `最新期に0または未取得の必須項目があります: ${zeroFieldsAfter.join(", ")}`,
      };
    }

    if (invalidHistoryPeriods.length > 0) {
      return {
        ticker: company.ticker,
        companyName: company.company_name,
        beforeHistory: beforeRow.beforeHistory,
        afterHistory,
        sourcePeriods,
        latestCorrected,
        zeroFieldsBefore: beforeRow.zeroFieldsBefore,
        zeroFieldsAfter,
        invalidHistoryPeriods,
        status: "failed",
        error: "履歴内に0または未取得の必須項目が残っています",
      };
    }

    if (sourcePeriods >= 3 && afterHistory < 3) {
      return {
        ticker: company.ticker,
        companyName: company.company_name,
        beforeHistory: beforeRow.beforeHistory,
        afterHistory,
        sourcePeriods,
        latestCorrected,
        zeroFieldsBefore: beforeRow.zeroFieldsBefore,
        zeroFieldsAfter,
        invalidHistoryPeriods,
        status: "failed",
        error: "3期以上の原本があるのに3期反映されていません",
      };
    }

    if (sourcePeriods < 3 && afterHistory < 3) {
      return {
        ticker: company.ticker,
        companyName: company.company_name,
        beforeHistory: beforeRow.beforeHistory,
        afterHistory,
        sourcePeriods,
        latestCorrected,
        zeroFieldsBefore: beforeRow.zeroFieldsBefore,
        zeroFieldsAfter,
        invalidHistoryPeriods,
        status: "insufficient-source",
      };
    }

    const repaired = latestCorrected || afterHistory > beforeRow.beforeHistory || beforeRow.zeroFieldsBefore.length > 0;
    return {
      ticker: company.ticker,
      companyName: company.company_name,
      beforeHistory: beforeRow.beforeHistory,
      afterHistory,
      sourcePeriods,
      latestCorrected,
      zeroFieldsBefore: beforeRow.zeroFieldsBefore,
      zeroFieldsAfter,
      invalidHistoryPeriods,
      status: repaired ? "repaired" : "unchanged",
    };
  });

  const summary = {
    targets: results.length,
    repaired: results.filter((row) => row.status === "repaired").length,
    unchanged: results.filter((row) => row.status === "unchanged").length,
    insufficientSource: results.filter((row) => row.status === "insufficient-source").length,
    failed: results.filter((row) => row.status === "failed").length,
  };

  const reportPath = path.join(
    process.cwd(),
    "logs",
    `financial-data-history-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), dryRun, summary, results }, null, 2));

  console.log("===== 統合修復結果 =====");
  console.log({ ...summary, reportPath });
  if (!dryRun && summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
