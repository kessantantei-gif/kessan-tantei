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
  industry_name: string | null;
  listing_date: string | null;
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
  financials: Json | null;
};

const SUPPORTED_FIELDS = [
  "revenue",
  "operatingIncome",
  "operatingCF",
  "cash",
  "currentAssets",
  "currentLiabilities",
  "assets",
  "liabilities",
  "netAssets",
  "loans",
  "deposits",
  "securities",
  "insuranceRevenue",
  "policyReserves",
] as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function profile(company: Company): "bank" | "insurance" | "general" {
  const source = `${company.company_name} ${company.industry_name ?? ""}`;
  if (/銀行|信用金庫|bank/i.test(source)) return "bank";
  if (/保険|生命|損害|insurance/i.test(source)) return "insurance";
  return "general";
}

function latestRequired(company: Company) {
  const kind = profile(company);
  if (kind === "bank") {
    return ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "loans", "deposits"];
  }
  if (kind === "insurance") {
    return ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "policyReserves"];
  }
  return ["revenue", "operatingIncome", "operatingCF", "cash", "currentAssets", "currentLiabilities", "assets", "liabilities", "netAssets"];
}

function zeroOrMissingLatest(company: Company, row: Json | null) {
  const source = row ?? {};
  return latestRequired(company).filter((key) => !finite(source[key]) || source[key] === 0);
}

function zeroFieldsInHistory(history: Json[] | null) {
  if (!Array.isArray(history)) return [];
  return history.flatMap((row) => {
    const period = String(row.periodEnd ?? row.fiscalYear ?? row.year ?? "unknown");
    const fields = SUPPORTED_FIELDS.filter((key) => key in row && finite(row[key]) && row[key] === 0);
    return fields.length ? [{ period, fields }] : [];
  });
}

function uniquePeriodCount(rows: Period[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = row.period_end ?? (row.fiscal_year ? String(row.fiscal_year) : "");
    if (key) keys.add(key);
  }
  return keys.size;
}

function listedAtLeastThreeYears(listingDate: string | null) {
  if (!listingDate) return false;
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
  const date = new Date(`${listingDate}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date <= cutoff;
}

async function main() {
  const [companies, analyses, periods] = await Promise.all([
    loadAllSupabaseRows<Company>("会社取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("id, ticker, company_name, industry_name, listing_date")
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
        .select("company_id, fiscal_year, period_end, financials")
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

  const incorrectValues: Json[] = [];
  const threePeriodShortage: Json[] = [];

  for (const company of companies) {
    const analysis = analysisMap.get(company.ticker);
    if (!analysis) continue;

    const latestIssues = zeroOrMissingLatest(company, analysis.financials);
    const historyIssues = zeroFieldsInHistory(analysis.history);
    if (latestIssues.length || historyIssues.length) {
      incorrectValues.push({
        ticker: company.ticker,
        companyName: company.company_name,
        profile: profile(company),
        latestIssues,
        historyIssues,
      });
    }

    const historyCount = Array.isArray(analysis.history) ? analysis.history.filter(Boolean).length : 0;
    const sourcePeriods = uniquePeriodCount(periodsByCompany.get(company.id) ?? []);
    const eligible = listedAtLeastThreeYears(company.listing_date) || sourcePeriods >= 3;
    if (eligible && historyCount < 3) {
      threePeriodShortage.push({
        ticker: company.ticker,
        companyName: company.company_name,
        listingDate: company.listing_date,
        historyCount,
        sourcePeriods,
      });
    }
  }

  const targetTickers = new Set([
    ...incorrectValues.map((row) => String(row.ticker)),
    ...threePeriodShortage.map((row) => String(row.ticker)),
  ]);

  const reportPath = path.join(
    process.cwd(),
    "logs",
    `targeted-financial-repair-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      readOnly: true,
      summary: {
        incorrectValues: incorrectValues.length,
        threePeriodShortage: threePeriodShortage.length,
        uniqueTargets: targetTickers.size,
      },
      incorrectValues,
      threePeriodShortage,
    }, null, 2)
  );

  console.log("===== 修復対象限定・読取専用監査 =====");
  console.log({
    readOnly: true,
    incorrectValues: incorrectValues.length,
    threePeriodShortage: threePeriodShortage.length,
    uniqueTargets: targetTickers.size,
    reportPath,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
