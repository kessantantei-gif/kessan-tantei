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
  document_id: string | null;
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

function explicitZeroFields(row: Json | null | undefined) {
  if (!row) return [];
  return SUPPORTED_FIELDS.filter((key) => key in row && finite(row[key]) && row[key] === 0);
}

function periodKey(row: Json | Period) {
  return String(
    (row as Json).periodEnd ??
      (row as Period).period_end ??
      (row as Json).fiscalYear ??
      (row as Period).fiscal_year ??
      (row as Json).year ??
      ""
  );
}

function zeroFieldsInHistory(history: Json[] | null) {
  if (!Array.isArray(history)) return [];
  return history.flatMap((row) => {
    const fields = explicitZeroFields(row);
    return fields.length ? [{ period: periodKey(row), fields }] : [];
  });
}

function uniquePeriods(rows: Period[]) {
  const map = new Map<string, Period>();
  for (const row of rows) {
    const key = row.period_end ?? (row.fiscal_year ? String(row.fiscal_year) : "");
    if (!key) continue;
    const current = map.get(key);
    if (!current || (!current.document_id && row.document_id)) map.set(key, row);
  }
  return [...map.values()].sort((a, b) => periodKey(a).localeCompare(periodKey(b)));
}

function latestPeriod(rows: Period[]) {
  return uniquePeriods(rows).at(-1) ?? null;
}

function missingOnlyInAnalysis(analysis: Json | null, normalized: Json | null) {
  if (!analysis || !normalized) return [];
  return SUPPORTED_FIELDS.filter((key) => {
    const normalizedValue = normalized[key];
    if (!finite(normalizedValue) || normalizedValue === 0) return false;
    const analysisValue = analysis[key];
    return !finite(analysisValue);
  });
}

function materiallyDifferentFields(analysis: Json | null, normalized: Json | null) {
  if (!analysis || !normalized) return [];
  return SUPPORTED_FIELDS.filter((key) => {
    const left = analysis[key];
    const right = normalized[key];
    if (!finite(left) || !finite(right)) return false;
    const scale = Math.max(Math.abs(left), Math.abs(right), 1);
    return Math.abs(left - right) / scale > 0.000001;
  });
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

  const incorrectValues: Json[] = [];
  const threePeriodShortage: Json[] = [];

  for (const company of companies) {
    const analysis = analysisMap.get(company.ticker);
    if (!analysis) continue;

    const companyPeriods = uniquePeriods(periodsByCompany.get(company.id) ?? []);
    const normalizedLatest = latestPeriod(companyPeriods)?.financials ?? null;

    const latestZeroFields = explicitZeroFields(analysis.financials);
    const normalizedLatestZeroFields = explicitZeroFields(normalizedLatest);
    const historyZeroPeriods = zeroFieldsInHistory(analysis.history);
    const missingInAnalysis = missingOnlyInAnalysis(analysis.financials, normalizedLatest);
    const differingFields = materiallyDifferentFields(analysis.financials, normalizedLatest);

    if (
      latestZeroFields.length > 0 ||
      normalizedLatestZeroFields.length > 0 ||
      historyZeroPeriods.length > 0 ||
      missingInAnalysis.length > 0 ||
      differingFields.length > 0
    ) {
      incorrectValues.push({
        ticker: company.ticker,
        companyName: company.company_name,
        latestZeroFields,
        normalizedLatestZeroFields,
        historyZeroPeriods,
        missingInAnalysis,
        differingFields,
      });
    }

    const analysisHistoryCount = Array.isArray(analysis.history)
      ? new Set(analysis.history.filter(Boolean).map(periodKey).filter(Boolean)).size
      : 0;
    const sourcePeriods = companyPeriods.length;

    if (sourcePeriods >= 3 && analysisHistoryCount < 3) {
      threePeriodShortage.push({
        ticker: company.ticker,
        companyName: company.company_name,
        listingDate: company.listing_date,
        analysisHistoryCount,
        sourcePeriods,
        documentIds: companyPeriods.map((row) => row.document_id).filter(Boolean),
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
    `targeted-financial-repair-audit-v3-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        rules: {
          zero: "保存済みの対象項目が明示的に0",
          missing: "正規化最新期には非ゼロ値があるが分析最新期に値がない",
          mismatch: "同じ最新期の両テーブルで非ゼロ数値が不一致",
          history: "正規化年次データが3期以上あるのに分析履歴が3期未満",
        },
        summary: {
          incorrectValues: incorrectValues.length,
          threePeriodShortage: threePeriodShortage.length,
          uniqueTargets: targetTickers.size,
        },
        incorrectValues,
        threePeriodShortage,
      },
      null,
      2
    )
  );

  console.log("===== 修復対象限定・読取専用監査 v3 =====");
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
