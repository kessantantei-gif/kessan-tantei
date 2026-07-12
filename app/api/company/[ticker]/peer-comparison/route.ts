import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import growthCompanies from "@/data/growth-companies.json";
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

function meta(company: CompanyRow) {
  return companyMetaMap.get(company.ticker) ?? null;
}

function comparableGap(a: number | null, b: number | null) {
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

  let distance = 0;
  let count = 0;

  for (const key of keys) {
    const currentGap = comparableGap(metric(target, key), metric(peer, key));
    if (currentGap === null) continue;
    distance += currentGap;
    count += 1;
  }

  if (count === 0) return Number.POSITIVE_INFINITY;

  const scoreGap = comparableGap(num(target.score), num(peer.score));
  const missingMetricPenalty = (keys.length - count) * 6;
  const missingScorePenalty = scoreGap === null ? 12 : 0;

  return (
    distance / count +
    (scoreGap ?? 0) * 0.35 +
    missingMetricPenalty +
    missingScorePenalty
  );
}

function growthDistance(target: CompanyRow, peer: CompanyRow) {
  const weightedMetrics = [
    { key: "revenueGrowth", weight: 1.2 },
    { key: "grossProfitGrowth", weight: 0.8 },
    { key: "operatingMargin", weight: 0.25 },
  ] as const;

  let distance = 0;
  let comparedWeight = 0;
  let comparedCount = 0;

  for (const item of weightedMetrics) {
    const currentGap = comparableGap(
      metric(target, item.key),
      metric(peer, item.key)
    );
    if (currentGap === null) continue;
    distance += currentGap * item.weight;
    comparedWeight += item.weight;
    comparedCount += 1;
  }

  if (comparedCount === 0 || comparedWeight === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const missingMetricPenalty = (weightedMetrics.length - comparedCount) * 15;
  return distance / comparedWeight + missingMetricPenalty;
}

function broadDistance(target: CompanyRow, peer: CompanyRow) {
  const financial = financialDistance(target, peer);
  const growth = growthDistance(target, peer);

  if (!Number.isFinite(financial) && !Number.isFinite(growth)) {
    return Number.POSITIVE_INFINITY;
  }

  const dangerGap = comparableGap(
    num(target.danger_score),
    num(peer.danger_score)
  );

  return (
    (Number.isFinite(financial) ? financial : 80) +
    (Number.isFinite(growth) ? growth * 0.35 : 30) +
    (dangerGap ?? 0) * 0.2 +
    (dangerGap === null ? 10 : 0)
  );
}

function normalize(
  company: CompanyRow,
  masterMap: Map<string, RuntimeCompanyMasterEntry>,
  isTarget = false
) {
  const master = masterMap.get(company.ticker) ?? null;
  const companyMeta = meta(company);

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
    (peer) => targetMeta.sector33 && meta(peer)?.sector33 === targetMeta.sector33
  );
  if (same33.length >= 3) return same33;

  const same17 = peers.filter(
    (peer) => targetMeta.sector17 && meta(peer)?.sector17 === targetMeta.sector17
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
  masterMap,
}: {
  id: string;
  label: string;
  description: string;
  basis: string[];
  target: CompanyRow;
  candidates: CompanyRow[];
  sortScore: (peer: CompanyRow) => number;
  masterMap: Map<string, RuntimeCompanyMasterEntry>;
}) {
  const scored = uniqueCompanies(candidates)
    .filter(
      (peer) => peer.ticker !== target.ticker && peer.risk_level !== "EXCLUDED"
    )
    .map((peer) => ({ peer, distance: sortScore(peer) }))
    .filter((item) => Number.isFinite(item.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)
    .map((item) => item.peer);

  return {
    id,
    label,
    description,
    basis,
    freeLimit: 3,
    proOnly: scored.length > 3,
    companies: [
      normalize(target, masterMap, true),
      ...scored.map((peer) => normalize(peer, masterMap)),
    ],
  };
}

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const [{ data: target, error: targetError }, runtimeEntries] = await Promise.all([
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, company_name, score, danger_score, financials, risk_level")
      .eq("ticker", ticker)
      .maybeSingle(),
    loadRuntimeCompanyMasterEntries(),
  ]);

  if (targetError || !target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: peers, error: peerError } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, risk_level")
    .neq("ticker", ticker)
    .neq("risk_level", "EXCLUDED")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(300);

  if (peerError) {
    return NextResponse.json({ error: "peer fetch failed" }, { status: 500 });
  }

  const targetCompany = target as CompanyRow;
  const candidatePeers = (peers ?? []) as CompanyRow[];
  const peerMap = mapByTicker(candidatePeers);
  const masterMap = new Map(runtimeEntries.map((entry) => [entry.ticker, entry]));
  const master = masterMap.get(ticker) ?? null;

  const curatedRivals = master
    ? orderedByTickers(master.rivalTickers, peerMap, ticker)
    : [];
  const sameSubTheme = orderedByTickers(
    getRuntimeSameSubThemeTickers(runtimeEntries, ticker),
    peerMap,
    ticker
  );
  const sameTheme = orderedByTickers(
    getRuntimeSameThemeTickers(runtimeEntries, ticker),
    peerMap,
    ticker
  );

  const themeCandidates = uniqueCompanies([
    ...curatedRivals,
    ...sameSubTheme,
    ...sameTheme,
  ]);
  const businessCandidates =
    themeCandidates.length >= 2
      ? themeCandidates
      : sectorFallback(targetCompany, candidatePeers);

  const comparisonLabel =
    master?.subTheme ??
    master?.theme ??
    meta(targetCompany)?.sector33 ??
    "事業・財務特性";

  const priorityCandidates = themeCandidates
    .filter((peer) => peer.ticker !== ticker)
    .slice(0, 8);

  const groups = [
    {
      id: "rival",
      label: "ライバル候補",
      description: master
        ? `${master.theme}の中で、管理画面で監修したライバルと同テーマ企業を優先しています。`
        : `${comparisonLabel}を優先し、スコア帯と成長段階が近い企業を並べています。`,
      basis: master
        ? [master.theme, master.subTheme, "監修済みライバル"]
        : [comparisonLabel, "スコア帯", "成長段階"],
      freeLimit: 3,
      proOnly: priorityCandidates.length > 3,
      companies: [
        normalize(targetCompany, masterMap, true),
        ...priorityCandidates.map((peer) => normalize(peer, masterMap)),
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
      masterMap,
    }),
    buildGroup({
      id: "financial",
      label: "財務類似企業",
      description: `${comparisonLabel}を優先したうえで、利益率・営業CF率・自己資本比率が近い企業です。`,
      basis: [comparisonLabel, "営業利益率", "営業CF率", "自己資本比率"],
      target: targetCompany,
      candidates: businessCandidates,
      sortScore: (peer) => financialDistance(targetCompany, peer),
      masterMap,
    }),
    buildGroup({
      id: "growth",
      label: "成長率が近い企業",
      description: `${comparisonLabel}を優先したうえで、売上成長率と粗利成長率が近い企業です。`,
      basis: [comparisonLabel, "売上成長率", "粗利成長率", "営業利益率"],
      target: targetCompany,
      candidates: businessCandidates,
      sortScore: (peer) => growthDistance(targetCompany, peer),
      masterMap,
    }),
  ].filter((group) => group.companies.length > 1);

  return NextResponse.json({
    ticker: targetCompany.ticker,
    companyName: targetCompany.company_name,
    peerBasis: master?.reviewed
      ? "curated-business-master"
      : master
        ? "multi-axis"
        : "sector-financial-fallback",
    comparisonLabel,
    masterReviewed: Boolean(master?.reviewed),
    note: master
      ? `比較対象は会社マスタの「${master.theme} / ${master.subTheme}」を最優先しています。`
      : `会社マスタ未登録のため「${comparisonLabel}」を優先し、財務・成長率・スコア帯で補完しています。`,
    groups,
    companies: groups[0]?.companies ?? [normalize(targetCompany, masterMap, true)],
    disclaimer:
      "比較候補は事業テーマと、取得できた財務データの理解補助です。欠損値は0として扱わず、実際の競合関係や個別銘柄の売買判断を示すものではありません。",
  });
}
