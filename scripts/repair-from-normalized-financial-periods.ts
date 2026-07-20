import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Json = Record<string, unknown>;
type Company = {
  id: string;
  ticker: string;
  company_name: string;
};
type Analysis = {
  ticker: string;
  financials: Json | null;
  history: Json[] | null;
};
type Period = {
  company_id: string;
  fiscal_year: number | null;
  period_end: string | null;
  document_id: string | null;
  financials: Json | null;
};

const FIELDS = [
  "revenue",
  "operatingIncome",
  "operatingCF",
  "cash",
  "currentAssets",
  "currentLiabilities",
  "assets",
  "liabilities",
  "netAssets",
  "ordinaryIncome",
  "ordinaryProfit",
  "loans",
  "deposits",
  "securities",
  "insuranceRevenue",
  "policyReserves",
] as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function periodKey(row: Json | Period | null | undefined) {
  if (!row) return "";
  return String(
    (row as Json).periodEnd ??
      (row as Period).period_end ??
      (row as Json).fiscalYear ??
      (row as Period).fiscal_year ??
      (row as Json).year ??
      ""
  );
}

function uniquePeriods(rows: Period[]) {
  const map = new Map<string, Period>();
  for (const row of rows) {
    const key = periodKey(row);
    if (!key) continue;
    const current = map.get(key);
    if (!current || (!current.document_id && row.document_id)) map.set(key, row);
  }
  return [...map.values()].sort((a, b) => periodKey(a).localeCompare(periodKey(b)));
}

function mergeFromNormalized(target: Json, source: Json) {
  const merged = { ...target };
  const changedFields: string[] = [];

  for (const key of FIELDS) {
    const sourceValue = source[key];
    if (!finite(sourceValue) || sourceValue === 0) continue;

    const targetValue = target[key];
    const targetMissingOrZero = !finite(targetValue) || targetValue === 0;
    const targetDifferent =
      finite(targetValue) &&
      Math.abs(targetValue - sourceValue) / Math.max(Math.abs(targetValue), Math.abs(sourceValue), 1) > 0.000001;

    if (targetMissingOrZero || targetDifferent) {
      merged[key] = sourceValue;
      changedFields.push(key);
    }
  }

  return { merged, changedFields };
}

async function main() {
  const [companies, analyses, periods] = await Promise.all([
    loadAllSupabaseRows<Company>("会社取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("id, ticker, company_name")
        .eq("listing_status", "listed")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Analysis>("分析取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, financials, history")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Period>("期間取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_financial_periods")
        .select("company_id, fiscal_year, period_end, document_id, financials")
        .eq("period_type", "annual")
        .order("fiscal_year", { ascending: true })
        .range(from, to)
    ),
  ]);

  const analysisMap = new Map(analyses.map((row) => [row.ticker, row]));
  const periodsByCompany = new Map<string, Period[]>();
  for (const row of periods) {
    const list = periodsByCompany.get(row.company_id) ?? [];
    list.push(row);
    periodsByCompany.set(row.company_id, list);
  }

  let repairedCompanies = 0;
  let repairedLatestFields = 0;
  let repairedHistoryFields = 0;
  let unresolvedCompanies = 0;
  const results: Json[] = [];

  for (const company of companies) {
    const analysis = analysisMap.get(company.ticker);
    if (!analysis) continue;

    const companyPeriods = uniquePeriods(periodsByCompany.get(company.id) ?? []);
    if (companyPeriods.length === 0) continue;

    const normalizedByPeriod = new Map(
      companyPeriods
        .filter((row) => row.financials && periodKey(row))
        .map((row) => [periodKey(row), row.financials as Json])
    );

    let nextFinancials = analysis.financials ? { ...analysis.financials } : null;
    let nextHistory = Array.isArray(analysis.history) ? analysis.history.map((row) => ({ ...row })) : [];
    const latestChanges: string[] = [];
    const historyChanges: Array<{ period: string; fields: string[] }> = [];

    const latestKey = periodKey(nextFinancials);
    if (nextFinancials && latestKey) {
      const normalizedLatest = normalizedByPeriod.get(latestKey);
      if (normalizedLatest) {
        const merged = mergeFromNormalized(nextFinancials, normalizedLatest);
        nextFinancials = merged.merged;
        latestChanges.push(...merged.changedFields);
      }
    }

    nextHistory = nextHistory.map((row) => {
      const key = periodKey(row);
      if (!key) return row;
      const normalized = normalizedByPeriod.get(key);
      if (!normalized) return row;
      const merged = mergeFromNormalized(row, normalized);
      if (merged.changedFields.length > 0) {
        historyChanges.push({ period: key, fields: merged.changedFields });
      }
      return merged.merged;
    });

    const changed = latestChanges.length > 0 || historyChanges.length > 0;
    if (!changed) continue;

    const { error } = await supabaseAdmin
      .from("company_analyses")
      .update({
        financials: nextFinancials,
        history: nextHistory,
      })
      .eq("ticker", company.ticker);

    if (error) {
      unresolvedCompanies += 1;
      results.push({
        ticker: company.ticker,
        companyName: company.company_name,
        status: "failed",
        error: error.message,
      });
      console.error(`[FAIL] ${company.ticker}: ${error.message}`);
      continue;
    }

    repairedCompanies += 1;
    repairedLatestFields += latestChanges.length;
    repairedHistoryFields += historyChanges.reduce((sum, row) => sum + row.fields.length, 0);
    results.push({
      ticker: company.ticker,
      companyName: company.company_name,
      status: "repaired",
      latestChanges,
      historyChanges,
    });
    console.log(`[OK] ${company.ticker} latest=${latestChanges.length} history=${historyChanges.length}`);
  }

  const reportPath = path.join(
    process.cwd(),
    "logs",
    `repair-from-normalized-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        repairedCompanies,
        repairedLatestFields,
        repairedHistoryFields,
        unresolvedCompanies,
        results,
      },
      null,
      2
    )
  );

  console.log("===== 正規化データからの限定修復結果 =====");
  console.log({ repairedCompanies, repairedLatestFields, repairedHistoryFields, unresolvedCompanies, reportPath });
  if (unresolvedCompanies > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
