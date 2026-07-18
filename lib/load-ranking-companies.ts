import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";
import type { RankingCompany } from "@/lib/rankings/types";
import { supabaseAdmin } from "@/lib/supabase";

type SpecialSecurityRow = {
  ticker: string;
  is_reit: boolean | null;
  is_foreign: boolean | null;
};

const CORE_FINANCIAL_KEYS = [
  "revenue",
  "operatingIncome",
  "operatingCF",
  "assets",
  "netAssets",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasMinimumFinancialData(company: RankingCompany) {
  const financials = company.financials;
  if (!financials) return false;

  const availableCoreFields = CORE_FINANCIAL_KEYS.filter((key) =>
    isFiniteNumber(financials[key])
  ).length;

  return availableCoreFields >= 2;
}

export async function loadRankingCompanies(marketSegment: string) {
  const [companies, specialSecurities] = await Promise.all([
    loadAllSupabaseRows<RankingCompany>(
      `${marketSegment}ランキング会社取得失敗`,
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select(
            "ticker, company_name, score, danger_score, risk_level, financials, history, risk"
          )
          .eq("market_segment", marketSegment)
          .neq("risk_level", "EXCLUDED")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
    loadAllSupabaseRows<SpecialSecurityRow>(
      `${marketSegment}特殊銘柄取得失敗`,
      (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select("ticker, is_reit, is_foreign")
          .eq("market_segment", marketSegment)
          .eq("listing_status", "listed")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
  ]);

  const excludedTickers = new Set(
    specialSecurities
      .filter((company) => company.is_reit === true || company.is_foreign === true)
      .map((company) => company.ticker)
  );

  return companies.filter(
    (company) =>
      !excludedTickers.has(company.ticker) && hasMinimumFinancialData(company)
  );
}
