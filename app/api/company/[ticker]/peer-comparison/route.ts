import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteProps = {
  params: Promise<{ ticker: string }>;
};

type CompanyRow = {
  ticker: string;
  company_name: string;
  score: number | null;
  danger_score: number | null;
  financials: Record<string, number | null | undefined> | null;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metric(company: CompanyRow, key: string) {
  return num(company.financials?.[key]);
}

function peerDistance(target: CompanyRow, peer: CompanyRow) {
  const keys = ["revenueGrowth", "grossProfitGrowth", "operatingMargin", "operatingCFMargin", "ocfMargin", "equityRatio"];
  let distance = 0;
  let count = 0;

  for (const key of keys) {
    const a = metric(target, key);
    const b = metric(peer, key);
    if (a === null || b === null) continue;
    distance += Math.abs(a - b);
    count += 1;
  }

  const scoreGap = Math.abs((target.score ?? 0) - (peer.score ?? 0));
  return (count ? distance / count : 999) + scoreGap * 0.5;
}

function normalize(company: CompanyRow, isTarget = false) {
  return {
    ticker: company.ticker,
    companyName: company.company_name,
    isTarget,
    score: company.score ?? null,
    dangerScore: company.danger_score ?? null,
    revenueGrowth: metric(company, "revenueGrowth"),
    operatingMargin: metric(company, "operatingMargin"),
    operatingCFMargin: metric(company, "operatingCFMargin") ?? metric(company, "ocfMargin"),
    equityRatio: metric(company, "equityRatio"),
  };
}

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const { data: target, error: targetError } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials")
    .eq("ticker", ticker)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const targetCompany = target as CompanyRow;

  const { data: peers, error: peerError } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, risk_level")
    .neq("ticker", ticker)
    .neq("risk_level", "EXCLUDED")
    .order("score", { ascending: false })
    .limit(150);

  if (peerError) {
    return NextResponse.json({ error: "peer fetch failed" }, { status: 500 });
  }

  const sortedPeers = ((peers ?? []) as (CompanyRow & { risk_level?: string | null })[])
    .filter((peer) => peer.ticker !== ticker && peer.risk_level !== "EXCLUDED")
    .sort((a, b) => peerDistance(targetCompany, a) - peerDistance(targetCompany, b))
    .slice(0, 5);

  return NextResponse.json({
    ticker: targetCompany.ticker,
    companyName: targetCompany.company_name,
    peerBasis: "similar-metrics",
    note: "スコアと主要財務指標が近い企業を比較候補として自動抽出しています。",
    companies: [normalize(targetCompany, true), ...sortedPeers.map((peer) => normalize(peer))],
    disclaimer: "同業比較は財務データの理解補助であり、個別銘柄の売買判断を示すものではありません。",
  });
}
