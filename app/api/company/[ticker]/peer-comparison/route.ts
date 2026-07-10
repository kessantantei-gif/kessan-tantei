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
  risk_level?: string | null;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metric(company: CompanyRow, key: string) {
  return num(company.financials?.[key]);
}

function gap(a: number | null, b: number | null, fallback = 999) {
  if (a === null || b === null) return fallback;
  return Math.abs(a - b);
}

function financialDistance(target: CompanyRow, peer: CompanyRow) {
  const keys = ["operatingMargin", "operatingCFMargin", "ocfMargin", "equityRatio", "cashRatio", "grossMargin"];
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
  return (count ? distance / count : 999) + scoreGap * 0.35;
}

function growthDistance(target: CompanyRow, peer: CompanyRow) {
  return (
    gap(metric(target, "revenueGrowth"), metric(peer, "revenueGrowth")) * 1.2 +
    gap(metric(target, "grossProfitGrowth"), metric(peer, "grossProfitGrowth")) * 0.8 +
    gap(metric(target, "operatingMargin"), metric(peer, "operatingMargin"), 120) * 0.25
  );
}

function broadPeerDistance(target: CompanyRow, peer: CompanyRow) {
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
  const dangerGap = Math.abs((target.danger_score ?? 0) - (peer.danger_score ?? 0));
  return (count ? distance / count : 999) + scoreGap * 0.5 + dangerGap * 0.25;
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

function uniqueByTicker(companies: CompanyRow[]) {
  const seen = new Set<string>();
  return companies.filter((company) => {
    if (seen.has(company.ticker)) return false;
    seen.add(company.ticker);
    return true;
  });
}

function buildGroup({
  id,
  label,
  description,
  basis,
  target,
  peers,
  score,
}: {
  id: string;
  label: string;
  description: string;
  basis: string[];
  target: CompanyRow;
  peers: CompanyRow[];
  score: (peer: CompanyRow) => number;
}) {
  const sortedPeers = uniqueByTicker(peers)
    .filter((peer) => peer.ticker !== target.ticker && peer.risk_level !== "EXCLUDED")
    .sort((a, b) => score(a) - score(b))
    .slice(0, 8);

  return {
    id,
    label,
    description,
    basis,
    freeLimit: 3,
    proOnly: sortedPeers.length > 3,
    companies: [normalize(target, true), ...sortedPeers.map((peer) => normalize(peer))],
  };
}

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const { data: target, error: targetError } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, risk_level")
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
    .limit(220);

  if (peerError) {
    return NextResponse.json({ error: "peer fetch failed" }, { status: 500 });
  }

  const candidatePeers = (peers ?? []) as CompanyRow[];
  const score = targetCompany.score ?? 0;
  const revenueGrowth = metric(targetCompany, "revenueGrowth");

  const groups = [
    buildGroup({
      id: "peer",
      label: "比較候補",
      description: "スコア・成長性・収益性・安全性が近い企業です。業種だけでなく財務の近さも加味しています。",
      basis: ["総合スコア", "売上成長率", "営業利益率", "営業CF率", "自己資本比率"],
      target: targetCompany,
      peers: candidatePeers,
      score: (peer) => broadPeerDistance(targetCompany, peer),
    }),
    buildGroup({
      id: "financial",
      label: "財務類似企業",
      description: "利益率・営業CF率・自己資本比率など、財務体質が近い企業です。",
      basis: ["営業利益率", "営業CF率", "自己資本比率", "現預金余力", "粗利率"],
      target: targetCompany,
      peers: candidatePeers,
      score: (peer) => financialDistance(targetCompany, peer),
    }),
    buildGroup({
      id: "growth",
      label: "成長率が近い企業",
      description: "売上成長率と粗利成長率が近い企業です。成長株同士の比較に使います。",
      basis: ["売上成長率", "売上総利益成長率", "営業利益率"],
      target: targetCompany,
      peers: candidatePeers,
      score: (peer) => growthDistance(targetCompany, peer),
    }),
    buildGroup({
      id: "rival",
      label: "ライバル候補",
      description: "投資家が横比較しやすい、スコア帯と成長ステージが近い企業です。",
      basis: ["スコア帯", "Danger帯", "成長率", "収益性"],
      target: targetCompany,
      peers: candidatePeers.filter((peer) => Math.abs((peer.score ?? 0) - score) <= 18 || gap(metric(peer, "revenueGrowth"), revenueGrowth, 999) <= 20),
      score: (peer) => broadPeerDistance(targetCompany, peer) * 0.8 + gap(peer.score, score, 99),
    }),
  ];

  return NextResponse.json({
    ticker: targetCompany.ticker,
    companyName: targetCompany.company_name,
    peerBasis: "multi-axis",
    note: "業種名だけではなく、財務指標・成長率・スコア帯を使って比較候補を自動抽出しています。",
    groups,
    companies: groups[0]?.companies ?? [normalize(targetCompany, true)],
    disclaimer: "比較候補は財務データの理解補助であり、実際の競合関係や個別銘柄の売買判断を示すものではありません。",
  });
}
