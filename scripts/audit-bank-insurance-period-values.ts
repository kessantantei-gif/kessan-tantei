import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Company = {
  id: string;
  ticker: string;
  company_name: string;
  industry_name: string | null;
};

type Analysis = {
  ticker: string;
  history: Array<Record<string, unknown>> | null;
};

type Period = {
  company_id: string;
  fiscal_year: number;
  period_end: string;
  document_id: string;
  financials: Record<string, unknown> | null;
};

const BANK_KEYS = ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "loans", "deposits"];
const INSURANCE_KEYS = ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "policyReserves"];

function profile(company: Company) {
  const source = `${company.company_name} ${company.industry_name ?? ""}`;
  if (/銀行|信用金庫|Bank/i.test(source)) return "bank" as const;
  if (/保険|生命|損害|Insurance/i.test(source)) return "insurance" as const;
  return null;
}

function zeroFields(financials: Record<string, unknown> | null, keys: string[]) {
  return keys.filter((key) => {
    const value = financials?.[key];
    return typeof value !== "number" || !Number.isFinite(value) || value === 0;
  });
}

async function main() {
  const [companies, analyses, periods] = await Promise.all([
    loadAllSupabaseRows<Company>("会社取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("id, ticker, company_name, industry_name")
        .eq("listing_status", "listed")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Analysis>("分析取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, history")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Period>("期間取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_financial_periods")
        .select("company_id, fiscal_year, period_end, document_id, financials")
        .order("period_end", { ascending: false })
        .range(from, to)
    ),
  ]);

  const analysisMap = new Map(analyses.map((row) => [row.ticker, row]));
  const periodsByCompany = new Map<string, Period[]>();
  for (const row of periods) {
    const current = periodsByCompany.get(row.company_id) ?? [];
    current.push(row);
    periodsByCompany.set(row.company_id, current);
  }

  const details = companies
    .map((company) => ({ company, profile: profile(company) }))
    .filter((item): item is { company: Company; profile: "bank" | "insurance" } => Boolean(item.profile))
    .map(({ company, profile }) => {
      const keys = profile === "bank" ? BANK_KEYS : INSURANCE_KEYS;
      const normalized = (periodsByCompany.get(company.id) ?? [])
        .sort((a, b) => b.period_end.localeCompare(a.period_end))
        .slice(0, 3)
        .map((row) => ({
          fiscalYear: row.fiscal_year,
          periodEnd: row.period_end,
          documentId: row.document_id,
          zeroFields: zeroFields(row.financials, keys),
        }));
      const history = analysisMap.get(company.ticker)?.history ?? [];
      return {
        ticker: company.ticker,
        companyName: company.company_name,
        profile,
        analysisHistoryCount: history.length,
        normalizedPeriodCount: normalized.length,
        validPeriodCount: normalized.filter((row) => row.zeroFields.length === 0).length,
        periods: normalized,
      };
    });

  const summary = {
    readOnly: true,
    targets: details.length,
    threePeriodsAndNoZeros: details.filter((row) => row.normalizedPeriodCount >= 3 && row.validPeriodCount >= 3).length,
    fewerThanThreePeriods: details.filter((row) => row.normalizedPeriodCount < 3).length,
    hasZeroInLatestThree: details.filter((row) => row.periods.some((period) => period.zeroFields.length > 0)).length,
  };

  const reportPath = path.join(process.cwd(), "logs", `bank-insurance-period-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, details }, null, 2));

  console.log("===== 銀行・保険 3期・ゼロ値 読取専用監査 =====");
  console.log({ ...summary, reportPath });
  for (const row of details.filter((item) => item.normalizedPeriodCount < 3 || item.validPeriodCount < 3)) {
    console.log(`[NG] ${row.ticker} ${row.companyName} ${row.normalizedPeriodCount}期 / 有効${row.validPeriodCount}期`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
