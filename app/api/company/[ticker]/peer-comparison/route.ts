import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import growthCompanies from "@/data/growth-companies.json";
import {
  getCompanyMaster,
  getSameSubThemeTickers,
  getSameThemeTickers,
} from "@/lib/company-master";

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

type CompanyMeta = {
  ticker: string;
  name: string;
  market?: string;
  sector33?: string;
  sector17?: string;
};

const companyMetaMap = new Map(
  (growthCompanies as CompanyMeta[]).map((company) => [company.ticker, company])
);

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

function meta(company: CompanyRow) {
  return companyMetaMap.get(company.ticker) ?? null;
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

function broadDistance(target: CompanyRow, peer: CompanyRow) {
  return (
    financialDistance(target, peer) +
    growthDistance(target, peer) * 0.35 +
    Math.abs((target.danger_score ?? 0) - (peer.danger_score ?? 0)) * 0.2
  );
}

function normalize(company: CompanyRow, isTarget = false) {
  const master = getCompanyMaster(company.ticker);
  const companyMeta = meta(company);

  return {
    ticker: company.ticker,
    companyName: company.company_name,
    isTarget,
    score: company.score ?? null,
    dangerScore: company.danger_score ?? null,
    revenueGrowth: metric(company, "revenueGrowth"),
    operatingMargin: metric(company, "operatingMargin"),
    operatingCFMargin:
      metric(company, "operatingCFMargin") ?? metric(company, "ocfMargin"),
    equityRatio: metric(company, "equityRatio"),
    theme: master?.theme ?? null,
    subTheme: master?.subTheme ?? null,
    sector33: companyMeta?.sector33 ?? null,
  };
}

function uniqueCompanies(companies: CompanyRow[]) {
  const seen = new Set<string>();
  return companies.filter((company) => {
    if (seen.has(company.ticker)) return false;
    seen.add(company.ticker);
    return true;
  });
}

function mapByTicker(companies: CompanyRow[]) {
  return new Map(companies.map((company) => [company.ticker, company]));
}

function orderedByTickers(
  tickers: string[],
  peerMap: Map<string, CompanyRow>,
  targetTicker: string
) {
  return tickers
    .filter((ticker) => ticker !== targetTicker)
    .map((ticker) => peerMap.get(ticker))
    .filter((company): company is CompanyRow => Boolean(company));
}

function sectorFallback(target: CompanyRow, peers: CompanyRow[]) {
  const targetMeta = meta(target);
  if (!targetMeta) return peers;

  const same33 = peers.filter(
    (peer) =>
      targetMeta.sector33 && meta(peer)?.sector33 === targetMeta.sector33
  );
  if (same33.length >= 3) return same33;

  const same17 = peers.filter(
    (peer) =>
      targetMeta.sector17 && meta(peer)?.sector17 === targetMeta.sector17
  );
  if (same17.length >= 3) return same17;

  return peers;
}

function buildGroup({
  id,
  label,
  description,
  basis,
  target,
  candidates,
  sortScore,
}: {
  id: string;
  label: string;
  description: string;
  basis: string[];
  target: CompanyRow;
  candidates: CompanyRow[];
  sortScore: (peer: CompanyRow) => number;
}) {
  const sorted = uniqueCompanies(candidates)
    .filter(
      (peer) =>
        peer.ticker !== target.ticker && peer.risk_level !== "EXCLUDED"
    )
    .sort((a, b) => sortScore(a) - sortScore(b))
    .slice(0, 8);

  return {
    id,
    label,
    description,
    basis,
    freeLimit: 3,
    proOnly: sorted.length > 3,
    companies: [normalize(target, true), ...sorted.map((peer) => normalize(peer))],
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

  const { data: peers, error: peerError } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, risk_level")
    .neq("ticker", ticker)
    .neq("risk_level", "EXCLUDED")
    .order("score", { ascending: false })
    .limit(300);

  if (peerError) {
    return NextResponse.json({ error: "peer fetch failed" }, { status: 500 });
  }

  const targetCompany = target as CompanyRow;
  const candidatePeers = (peers ?? []) as CompanyRow[];
  const peerMap = mapByTicker(candidatePeers);
  const master = getCompanyMaster(ticker);

  const curatedRivals = master
    ? orderedByTickers(master.rivalTickers, peerMap, ticker)
    : [];
  const sameSubTheme = orderedByTickers(
    getSameSubThemeTickers(ticker),
    peerMap,
    ticker
  );
  const sameTheme = orderedByTickers(
    getSameThemeTickers(ticker),
    peerMap,
    ticker
  );

  const businessCandidates =
    uniqueCompanies([...curatedRivals, ...sameSubTheme, ...sameTheme]).length >= 2
      ? uniqueCompanies([...curatedRivals, ...sameSubTheme, ...sameTheme])
      : sectorFallback(targetCompany, candidatePeers);

  const comparisonLabel =
    master?.subTheme ??
    master?.theme ??
    meta(targetCompany)?.sector33 ??
    "事業・財務特性";

  const groups = [
    {
      id: "rival",
      label: "ライバル候補",
      description: master
        ? `${master.theme}の中で、監修済みライバルと同テーマ企業を優先しています。`
        : `${comparisonLabel}を優先し、スコア帯と成長段階が近い企業を並べています。`,
      basis: master
        ? [master.theme, master.subTheme, "監修済みライバル"]
        : [comparisonLabel, "スコア帯", "成長段階"],
      freeLimit: 3,
      proOnly: businessCandidates.length > 3,
      companies: [
        normalize(targetCompany, true),
        ...uniqueCompanies([...curatedRivals, ...sameSubTheme, ...sameTheme])
          .filter((peer) => peer.ticker !== ticker)
          .slice(0, 8)
          .map((peer) => normalize(peer)),
      ],
    },
    buildGroup({
      id: "peer",
      label: "事業テーマ比較",
      description: `${comparisonLabel}を優先し、その中で財務指標が近い企業を並べています。`,
      basis: [comparisonLabel, "総合スコア", "収益性", "財務安全性"],
      target: targetCompany,
      candidates: businessCandidates,
      sortScore: (peer) => broadDistance(targetCompany, peer),
    }),
    buildGroup({
      id: "financial",
      label: "財務類似企業",
      description: `${comparisonLabel}を優先したうえで、利益率・営業CF率・自己資本比率が近い企業です。`,
      basis: [comparisonLabel, "営業利益率", "営業CF率", "自己資本比率"],
      target: targetCompany,
      candidates: businessCandidates,
      sortScore: (peer) => financialDistance(targetCompany, peer),
    }),
    buildGroup({
      id: "growth",
      label: "成長率が近い企業",
      description: `${comparisonLabel}を優先したうえで、売上成長率と粗利成長率が近い企業です。`,
      basis: [comparisonLabel, "売上成長率", "粗利成長率", "営業利益率"],
      target: targetCompany,
      candidates: businessCandidates,
      sortScore: (peer) => growthDistance(targetCompany, peer),
    }),
  ].filter((group) => group.companies.length > 1);

  return NextResponse.json({
    ticker: targetCompany.ticker,
    companyName: targetCompany.company_name,
    peerBasis: master ? "curated-business-master" : "sector-financial-fallback",
    comparisonLabel,
    masterReviewed: Boolean(master?.reviewed),
    note: master
      ? `比較対象は監修済み会社マスタの「${master.theme} / ${master.subTheme}」を最優先しています。`
      : `会社マスタ未登録のため「${comparisonLabel}」を優先し、財務・成長率・スコア帯で補完しています。`,
    groups,
    companies: groups[0]?.companies ?? [normalize(targetCompany, true)],
    disclaimer:
      "比較候補は事業テーマと財務データの理解補助であり、実際の競合関係や個別銘柄の売買判断を示すものではありません。",
  });
}
