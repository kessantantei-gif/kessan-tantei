import "server-only";

import { unstable_cache } from "next/cache";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";
import type { MarketSlug } from "@/lib/markets";
import { supabaseAdmin } from "@/lib/supabase";

export const MARKET_COMPANY_PAGE_SIZE = 100;

type AnalysisRow = {
  ticker: string;
  company_name: string;
  score: number | null;
  danger_score: number | null;
  risk_level: string | null;
  financials: Record<string, unknown> | null;
  updated_at: string | null;
};

type MasterRow = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
  industry_name: string | null;
  last_financial_update: string | null;
  updated_at: string | null;
};

export type MarketDirectoryCompany = {
  ticker: string;
  companyName: string;
  industryName: string;
  score: number;
  dangerScore: number;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  lastUpdated: string | null;
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function loadMarketCompanyDirectoryUncached(
  marketSlug: MarketSlug
): Promise<MarketDirectoryCompany[]> {
  const [analyses, masters] = await Promise.all([
    loadAllSupabaseRows<AnalysisRow>(
      `${marketSlug}企業一覧の分析データ取得失敗`,
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select(
            "ticker, company_name, score, danger_score, risk_level, financials, updated_at"
          )
          .eq("market_segment", marketSlug)
          .neq("risk_level", "EXCLUDED")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
    loadAllSupabaseRows<MasterRow>(
      `${marketSlug}企業一覧の上場マスタ取得失敗`,
      (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select(
            "ticker, company_name, market_segment, industry_name, last_financial_update, updated_at"
          )
          .eq("listing_status", "listed")
          .eq("market_segment", marketSlug)
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
  ]);

  const masterByTicker = new Map(masters.map((master) => [master.ticker, master]));

  return analyses
    .map((analysis) => {
      const master = masterByTicker.get(analysis.ticker);
      if (!master) return null;

      return {
        ticker: analysis.ticker,
        companyName: analysis.company_name || master.company_name,
        industryName: master.industry_name || "業種未分類",
        score: finiteNumber(analysis.score) ?? 0,
        dangerScore: finiteNumber(analysis.danger_score) ?? 0,
        revenueGrowth: finiteNumber(analysis.financials?.revenueGrowth),
        operatingMargin: finiteNumber(analysis.financials?.operatingMargin),
        lastUpdated:
          master.last_financial_update ?? analysis.updated_at ?? master.updated_at ?? null,
      } satisfies MarketDirectoryCompany;
    })
    .filter((company): company is MarketDirectoryCompany => company !== null)
    .sort((a, b) =>
      a.ticker.localeCompare(b.ticker, "ja", {
        numeric: true,
        sensitivity: "base",
      })
    );
}

export const loadMarketCompanyDirectory = unstable_cache(
  loadMarketCompanyDirectoryUncached,
  ["market-company-directory-v1"],
  {
    revalidate: 3600,
    tags: ["market-company-directory"],
  }
);
