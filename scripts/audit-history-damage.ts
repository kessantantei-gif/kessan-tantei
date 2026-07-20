import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Json = Record<string, unknown>;

type AnalysisRow = {
  ticker: string;
  company_name: string;
  history: Json[] | null;
  financials: Json | null;
};

type CompanyRow = {
  id: string;
  ticker: string;
  company_name: string;
  industry_name: string | null;
  is_financial: boolean | null;
};

type PeriodRow = {
  company_id: string;
  fiscal_year: number | null;
  period_end: string | null;
  document_id: string | null;
  financials: Json | null;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function historyCount(history: Json[] | null) {
  if (!Array.isArray(history)) return 0;
  const keys = new Set<string>();
  for (const row of history) {
    const key = String(
      row.periodEnd ??
        row.period_end ??
        row.fiscalPeriod ??
        row.fiscal_period ??
        row.fiscalYear ??
        row.fiscal_year ??
        row.year ??
        row.docID ??
        row.document_id ??
        ""
    );
    if (key) keys.add(key);
  }
  return keys.size;
}

function periodCount(rows: PeriodRow[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = String(row.period_end ?? row.fiscal_year ?? row.document_id ?? "");
    if (key) keys.add(key);
  }
  return keys.size;
}

function readAffectedTickers() {
  const files = (argValue("reports") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const tickers = new Set<string>();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const report = JSON.parse(fs.readFileSync(file, "utf8")) as {
      results?: Array<{ ticker?: string; status?: string }>;
    };
    for (const row of report.results ?? []) {
      if (row.ticker) tickers.add(row.ticker);
    }
  }
  return tickers;
}

function distribution(values: number[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value >= 3 ? "3以上" : String(value);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const [analyses, companies, periods] = await Promise.all([
    loadAllSupabaseRows<AnalysisRow>(
      "company_analyses監査",
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, company_name, history, financials")
          .order("ticker", { ascending: true })
          .range(from, to),
      1000
    ),
    loadAllSupabaseRows<CompanyRow>(
      "all_market_companies監査",
      (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select("id, ticker, company_name, industry_name, is_financial")
          .order("ticker", { ascending: true })
          .range(from, to),
      1000
    ),
    loadAllSupabaseRows<PeriodRow>(
      "company_financial_periods監査",
      (from, to) =>
        supabaseAdmin
          .from("company_financial_periods")
          .select("company_id, fiscal_year, period_end, document_id, financials")
          .order("company_id", { ascending: true })
          .range(from, to),
      1000
    ),
  ]);

  const analysisMap = new Map(analyses.map((row) => [row.ticker, row]));
  const companyMap = new Map(companies.map((row) => [row.ticker, row]));
  const periodsByCompany = new Map<string, PeriodRow[]>();

  for (const row of periods) {
    const current = periodsByCompany.get(row.company_id) ?? [];
    current.push(row);
    periodsByCompany.set(row.company_id, current);
  }

  const affectedTickers = readAffectedTickers();
  const details = companies.map((company) => {
    const analysis = analysisMap.get(company.ticker);
    const normalizedRows = periodsByCompany.get(company.id) ?? [];
    const analysisHistoryCount = historyCount(analysis?.history ?? null);
    const normalizedHistoryCount = periodCount(normalizedRows);
    return {
      ticker: company.ticker,
      companyName: company.company_name,
      industryName: company.industry_name,
      isFinancial: Boolean(company.is_financial),
      affectedByZeroRepair: affectedTickers.has(company.ticker),
      analysisHistoryCount,
      normalizedHistoryCount,
      recoverableFromNormalized:
        analysisHistoryCount < 2 && normalizedHistoryCount >= 2,
      missingInBoth:
        analysisHistoryCount < 2 && normalizedHistoryCount < 2,
    };
  });

  const kioxia = details.find((row) => row.ticker === "285A") ?? null;
  const financials = details.filter(
    (row) => row.isFinancial || /銀行|保険|証券|その他金融/.test(row.industryName ?? "")
  );
  const affected = details.filter((row) => row.affectedByZeroRepair);
  const recoverable = details.filter((row) => row.recoverableFromNormalized);
  const missingInBoth = details.filter((row) => row.missingInBoth);

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    totals: {
      analyses: analyses.length,
      companies: companies.length,
      normalizedPeriods: periods.length,
      affectedTickers: affectedTickers.size,
    },
    distributions: {
      allAnalysisHistory: distribution(details.map((row) => row.analysisHistoryCount)),
      allNormalizedHistory: distribution(details.map((row) => row.normalizedHistoryCount)),
      affectedAnalysisHistory: distribution(affected.map((row) => row.analysisHistoryCount)),
      affectedNormalizedHistory: distribution(affected.map((row) => row.normalizedHistoryCount)),
      financialAnalysisHistory: distribution(financials.map((row) => row.analysisHistoryCount)),
      financialNormalizedHistory: distribution(financials.map((row) => row.normalizedHistoryCount)),
    },
    kioxia,
    affected,
    recoverable,
    missingInBoth,
  };

  const outputPath = path.join(
    process.cwd(),
    "logs",
    `history-damage-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log("===== 履歴破損・読取専用監査 =====");
  console.log({
    readOnly: true,
    allAnalysisHistory: report.distributions.allAnalysisHistory,
    allNormalizedHistory: report.distributions.allNormalizedHistory,
    affectedAnalysisHistory: report.distributions.affectedAnalysisHistory,
    affectedNormalizedHistory: report.distributions.affectedNormalizedHistory,
    financialAnalysisHistory: report.distributions.financialAnalysisHistory,
    financialNormalizedHistory: report.distributions.financialNormalizedHistory,
    recoverableFromNormalized: recoverable.length,
    missingInBoth: missingInBoth.length,
    kioxia,
    reportPath: outputPath,
  });
}

main().catch((error) => {
  console.error("履歴監査に失敗しました");
  console.error(error);
  process.exit(1);
});
