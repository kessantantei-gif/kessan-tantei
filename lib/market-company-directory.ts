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
  analyzed: boolean;
  score: number | null;
  dangerScore: number | null;
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

  const analysisByTicker = new Map(analyses.map((analysis) => [analysis.ticker, analysis]));

  return masters
    .map((master) => {
      const analysis = analysisByTicker.get(master.ticker);
      return {
        ticker: master.ticker,
        companyName: master.company_name || analysis?.company_name || master.ticker,
        industryName: master.industry_name || "業種未分類",
        analyzed: Boolean(analysis),
        score: finiteNumber(analysis?.score),
        dangerScore: finiteNumber(analysis?.danger_score),
        revenueGrowth: finiteNumber(analysis?.financials?.revenueGrowth),
        operatingMargin: finiteNumber(analysis?.financials?.operatingMargin),
        lastUpdated:
          master.last_financial_update ?? analysis?.updated_at ?? master.updated_at ?? null,
      } satisfies MarketDirectoryCompany;
    })
    .sort((a, b) =>
      a.ticker.localeCompare(b.ticker, "ja", {
        numeric: true,
        sensitivity: "base",
      })
    );
}

export const loadMarketCompanyDirectory = unstable_cache(
  loadMarketCompanyDirectoryUncached,
  ["market-company-directory-v2"],
  {
    revalidate: 3600,
    tags: ["market-company-directory"],
  }
);
