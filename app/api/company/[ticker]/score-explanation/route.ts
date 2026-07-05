import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteProps = {
  params: Promise<{ ticker: string }>;
};

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, score_breakdown, financials, risk")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    ticker: data.ticker,
    companyName: data.company_name,
    score: data.score ?? 0,
    scoreBreakdown: data.score_breakdown ?? {},
    financials: data.financials ?? {},
    riskFlags: data.risk?.flags ?? [],
  });
}
