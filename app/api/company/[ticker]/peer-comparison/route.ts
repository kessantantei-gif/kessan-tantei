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
  industry?: string | null;
  sector?: string | null;
  market?: string | null;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metric(company: CompanyRow, key: string) {
  return num(company.financials?.[key]);
}

function peerDistance(target: CompanyRow, peer: CompanyRow) {
  const keys = ["revenueGrowth", "operatingMargin", "operatingCFMargin", "equityRatio"];
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
    industry: company.industry ?? company.sector ?? null,
  };
}

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const { data: target, error: targetError } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, industry, sector, market")
    .eq("ticker", ticker)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const targetCompany = target as CompanyRow;
  const targetIndustry = targetCompany.industry ?? targetCompany.sector ?? null;

  let peerQuery = supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, industry, sector, market")
    .neq("ticker", ticker)
    .neq("risk_level", "EXCLUDED")
    .limit(120);

  if (targetIndustry) {
    peerQuery = peerQuery.or(`industry.eq.${targetIndustry},sector.eq.${targetIndustry}`);
  }

  let { data: peers, error: peerError } = await peerQuery;

  if (peerError || !peers || peers.length < 3) {
    const fallback = await supabaseAdmin
      .from("company_analyses")
      .select("ticker, company_name, score, danger_score, financials, industry, sector, market")
      .neq("ticker", ticker)
      .neq("risk_level", "EXCLUDED")
      .order("score", { ascending: false })
      .limit(120);

    peers = fallback.data ?? [];
  }

  const sortedPeers = ((peers ?? []) as CompanyRow[])
    .filter((peer) => peer.ticker !== ticker)
    .sort((a, b) => peerDistance(targetCompany, a) - peerDistance(targetCompany, b))
    .slice(0, 5);

  return NextResponse.json({
    ticker: targetCompany.ticker,
    companyName: targetCompany.company_name,
    peerBasis: targetIndustry ? "industry" : "similar-metrics",
    note: targetIndustry
      ? "同業種または近い業種の企業を優先して比較しています。"
      : "業種データが不足しているため、スコアと主要財務指標が近い企業を比較候補にしています。",
    companies: [normalize(targetCompany, true), ...sortedPeers.map((peer) => normalize(peer))],
    disclaimer: "同業比較は財務データの理解補助であり、個別銘柄の売買判断を示すものではありません。",
  });
}
