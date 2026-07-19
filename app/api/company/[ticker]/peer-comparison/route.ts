import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";
import {
  getRuntimeSameSubThemeTickers,
  getRuntimeSameThemeTickers,
  loadRuntimeCompanyMasterEntries,
  type RuntimeCompanyMasterEntry,
} from "@/lib/company-master-runtime";

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

type MarketCompany = {
  ticker: string;
  industry_name: string | null;
  market_segment: string | null;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metric(company: CompanyRow, key: string) {
  return num(company.financials?.[key]);
}

function gap(a: number | null, b: number | null) {
  if (a === null || b === null) return null;
  return Math.abs(a - b);
}

function financialDistance(target: CompanyRow, peer: CompanyRow) {
  const keys = [
    "operatingMargin",
    "operatingCFMargin",
    "ocfMargin",
    "equityRatio",
    "cashRatio",
    "grossMargin",
  ];
  let total = 0;
  let count = 0;

  for (const key of keys) {
    const value = gap(metric(target, key), metric(peer, key));
    if (value === null) continue;
    total += value;
    count += 1;
  }

  if (count === 0) return Number.POSITIVE_INFINITY;
  return total / count + (gap(num(target.score), num(peer.score)) ?? 20) * 0.35;
}

function growthDistance(target: CompanyRow, peer: CompanyRow) {
  const keys = ["revenueGrowth", "grossProfitGrowth", "operatingMargin"];
  let total = 0;
  let count = 0;

  for (const key of keys) {
    const value = gap(metric(target, key), metric(peer, key));
    if (value === null) continue;
    total += value;
    count += 1;
  }

  return count === 0 ? Number.POSITIVE_INFINITY : total / count;
}

function broadDistance(target: CompanyRow, peer: CompanyRow) {
  const financial = financialDistance(target, peer);
  const growth = growthDistance(target, peer);
  const scoreGap = gap(num(target.score), num(peer.score));
  const dangerGap = gap(num(target.danger_score), num(peer.danger_score));

  if (!Number.isFinite(financial) && !Number.isFinite(growth)) {
    if (scoreGap === null && dangerGap === null) return Number.POSITIVE_INFINITY;
    return (scoreGap ?? 50) + (dangerGap ?? 20) * 0.5;
  }

  return (
    (Number.isFinite(financial) ? financial : 60) +
    (Number.isFinite(growth) ? growth * 0.4 : 25) +
    (scoreGap ?? 10) * 0.25 +
    (dangerGap ?? 5) * 0.2
  );
}

function normalize(
  company: CompanyRow,
  masterMap: Map<string, RuntimeCompanyMasterEntry>,
  industryMap: Map<string, string>,
  isTarget = false
) {
  const master = masterMap.get(company.ticker);
  return {
    ticker: company.ticker,
    companyName: company.company_name,
    isTarget,
    score: num(company.score),
    dangerScore: num(company.danger_score),
    revenueGrowth: metric(company, "revenueGrowth"),
    operatingMargin: metric(company, "operatingMargin"),
    operatingCFMargin:
      metric(company, "operatingCFMargin") ?? metric(company, "ocfMargin"),
    equityRatio: metric(company, "equityRatio"),
    theme: master?.theme ?? null,
    subTheme: master?.subTheme ?? null,
    sector33: industryMap.get(company.ticker) ?? null,
  };
}

function unique(companies: CompanyRow[]) {
  const seen = new Set<string>();
  return companies.filter((company) => {
    if (seen.has(company.ticker)) return false;
    seen.add(company.ticker);
    return true;
  });
}

function pickByTickers(tickers: string[], map: Map<string, CompanyRow>, target: string) {
  return tickers
    .filter((ticker) => ticker !== target)
    .map((ticker) => map.get(ticker))
    .filter((company): company is CompanyRow => Boolean(company));
}

function ranked(target: CompanyRow, candidates: CompanyRow[], mode: "broad" | "financial" | "growth") {
  const distance =
    mode === "financial"
      ? (peer: CompanyRow) => financialDistance(target, peer)
      : mode === "growth"
        ? (peer: CompanyRow) => growthDistance(target, peer)
        : (peer: CompanyRow) => broadDistance(target, peer);

  return unique(candidates)
    .filter((peer) => peer.ticker !== target.ticker && peer.risk_level !== "EXCLUDED")
    .map((peer) => ({ peer, distance: distance(peer) }))
    .filter((item) => Number.isFinite(item.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)
    .map((item) => item.peer);
}

function group(
  id: string,
  label: string,
  description: string,
  basis: string[],
  target: CompanyRow,
  candidates: CompanyRow[],
  mode: "broad" | "financial" | "growth",
  masterMap: Map<string, RuntimeCompanyMasterEntry>,
  industryMap: Map<string, string>
) {
  const peers = ranked(target, candidates, mode);
  return {
    id,
    label,
    description,
    basis,
    freeLimit: 3,
    proOnly: peers.length > 3,
    companies: [
      normalize(target, masterMap, industryMap, true),
      ...peers.map((peer) => normalize(peer, masterMap, industryMap)),
    ],
  };
}

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const [{ data: target, error: targetError }, runtimeEntries, allPeers, marketCompanies] =
    await Promise.all([
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, score, danger_score, financials, risk_level")
        .eq("ticker", ticker)
        .maybeSingle(),
      loadRuntimeCompanyMasterEntries(),
      loadAllSupabaseRows<CompanyRow>("比較候補全社取得失敗", (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, company_name, score, danger_score, financials, risk_level")
          .neq("risk_level", "EXCLUDED")
          .order("ticker", { ascending: true })
          .range(from, to)
      ),
      loadAllSupabaseRows<MarketCompany>("比較候補業種取得失敗", (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select("ticker, industry_name, market_segment")
          .eq("listing_status", "listed")
          .order("ticker", { ascending: true })
          .range(from, to)
      ),
    ]);

  if (targetError || !target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const targetCompany = target as CompanyRow;
  const candidatePeers = allPeers.filter((peer) => peer.ticker !== ticker);
  const peerMap = new Map(candidatePeers.map((peer) => [peer.ticker, peer]));
  const masterMap = new Map(runtimeEntries.map((entry) => [entry.ticker, entry]));
  const industryMap = new Map(
    marketCompanies
      .filter((company) => company.industry_name)
      .map((company) => [company.ticker, company.industry_name as string])
  );
  const marketMap = new Map(marketCompanies.map((company) => [company.ticker, company.market_segment]));
  const master = masterMap.get(ticker) ?? null;
  const targetIndustry = industryMap.get(ticker) ?? null;
  const targetMarket = marketMap.get(ticker) ?? null;

  const themeCandidates = unique([
    ...pickByTickers(master?.rivalTickers ?? [], peerMap, ticker),
    ...pickByTickers(getRuntimeSameSubThemeTickers(runtimeEntries, ticker), peerMap, ticker),
    ...pickByTickers(getRuntimeSameThemeTickers(runtimeEntries, ticker), peerMap, ticker),
  ]);

  const industryCandidates = targetIndustry
    ? candidatePeers.filter((peer) => industryMap.get(peer.ticker) === targetIndustry)
    : [];
  const sameMarketCandidates = targetMarket
    ? candidatePeers.filter((peer) => marketMap.get(peer.ticker) === targetMarket)
    : [];

  const businessCandidates =
    themeCandidates.length >= 2
      ? themeCandidates
      : industryCandidates.length >= 2
        ? industryCandidates
        : sameMarketCandidates.length >= 2
          ? sameMarketCandidates
          : candidatePeers;

  const comparisonLabel = master?.subTheme ?? master?.theme ?? targetIndustry ?? "事業・財務特性";
  const prioritySource = themeCandidates.length > 0 ? themeCandidates : businessCandidates;
  const priorityCandidates = ranked(targetCompany, prioritySource, "broad");

  const groups = [
    {
      id: "rival",
      label: "ライバル候補",
      description: `${comparisonLabel}を優先し、財務・成長率・スコアが近い企業を並べています。`,
      basis: [comparisonLabel, "総合スコア", "成長段階"],
      freeLimit: 3,
      proOnly: priorityCandidates.length > 3,
      companies: [
        normalize(targetCompany, masterMap, industryMap, true),
        ...priorityCandidates.map((peer) => normalize(peer, masterMap, industryMap)),
      ],
    },
    group(
      "peer",
      "事業テーマ比較",
      `${comparisonLabel}を優先し、その中で総合的に近い企業です。`,
      [comparisonLabel, "総合スコア", "収益性", "財務安全性"],
      targetCompany,
      businessCandidates,
      "broad",
      masterMap,
      industryMap
    ),
    group(
      "financial",
      "財務類似企業",
      `${comparisonLabel}を優先し、利益率・営業CF率・自己資本比率が近い企業です。`,
      [comparisonLabel, "営業利益率", "営業CF率", "自己資本比率"],
      targetCompany,
      businessCandidates,
      "financial",
      masterMap,
      industryMap
    ),
    group(
      "growth",
      "成長率が近い企業",
      `${comparisonLabel}を優先し、売上成長率・粗利成長率が近い企業です。`,
      [comparisonLabel, "売上成長率", "粗利成長率", "営業利益率"],
      targetCompany,
      businessCandidates,
      "growth",
      masterMap,
      industryMap
    ),
  ].filter((item) => item.companies.length > 1);

  return NextResponse.json({
    ticker: targetCompany.ticker,
    companyName: targetCompany.company_name,
    peerBasis: master?.reviewed
      ? "curated-business-master"
      : targetIndustry
        ? "industry"
        : "similar-metrics",
    comparisonLabel,
    masterReviewed: Boolean(master?.reviewed),
    note: `比較対象は「${comparisonLabel}」を優先し、全上場会社から補完しています。`,
    groups,
    companies: groups[0]?.companies ?? [normalize(targetCompany, masterMap, industryMap, true)],
    disclaimer:
      "比較候補は事業テーマと取得済み財務データの理解補助です。実際の競合関係や売買判断を示すものではありません。",
  });
}
