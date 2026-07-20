import { NextResponse } from "next/server";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";
import { supabaseAdmin } from "@/lib/supabase";

type SearchCompanyRow = {
  ticker: string;
  company_name: string;
  score: number | null;
  danger_score: number | null;
  risk_level: string | null;
  market_segment: string | null;
};

const SEARCHABLE_MARKETS = new Set(["growth", "standard", "prime"]);

export async function GET() {
  try {
    const rows = await loadAllSupabaseRows<SearchCompanyRow>(
      "全市場企業検索データ取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select(
            "ticker, company_name, score, danger_score, risk_level, market_segment"
          )
          .neq("risk_level", "EXCLUDED")
          .order("ticker", { ascending: true })
          .range(from, to)
    );

    const companies = rows
      .filter(
        (row) =>
          SEARCHABLE_MARKETS.has(row.market_segment ?? "") &&
          Boolean(row.ticker) &&
          Boolean(row.company_name)
      )
      .map((row) => ({
        ticker: row.ticker,
        company_name: row.company_name,
        score:
          typeof row.score === "number" && Number.isFinite(row.score)
            ? row.score
            : 0,
        danger_score:
          typeof row.danger_score === "number" &&
          Number.isFinite(row.danger_score)
            ? row.danger_score
            : 0,
        market_segment: row.market_segment,
      }));

    return NextResponse.json(
      { companies },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
        },
      }
    );
  } catch (error) {
    console.error("全市場企業検索APIエラー", error);
    return NextResponse.json(
      { error: "企業検索データを取得できませんでした。" },
      { status: 500 }
    );
  }
}
