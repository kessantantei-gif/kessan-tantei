import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import growthCompanies from "@/data/growth-companies.json";

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

type Theme = {
  id: string;
  label: string;
  tickers: string[];
  keywords: string[];
};

const THEMES: Theme[] = [
  {
    id: "space",
    label: "宇宙・衛星",
    tickers: ["186A", "9348", "5595", "290A"],
    keywords: ["アストロスケール", "ｉｓｐａｃｅ", "ispace", "ＱＰＳ", "QPS", "Ｓｙｎｓｐｅｃｔｉｖｅ", "Synspective", "宇宙", "衛星"],
  },
  {
    id: "biotech",
    label: "創薬・バイオ",
    tickers: [],
    keywords: ["バイオ", "ファーマ", "創薬", "医薬", "メディシノバ", "ペルセウス", "サンバイオ", "ヘリオス"],
  },
  {
    id: "ai",
    label: "AI・機械学習",
    tickers: [],
    keywords: ["ＡＩ", "AI", "ＰＫＳＨＡ", "PKSHA", "ＨＥＲＯＺ", "HEROZ", "ＶＲＡＩＮ", "VRAIN", "ＦＲＯＮＴＥＯ", "FRONTEO"],
  },
  {
    id: "saas",
    label: "SaaS・クラウド",
    tickers: [],
    keywords: ["ＳａａＳ", "SaaS", "クラウド", "ｆｒｅｅｅ", "freee", "ＨＥＮＮＧＥ", "HENNGE", "サイボウズ", "マネーフォワード"],
  },
  {
    id: "game-ip",
    label: "ゲーム・IP・コンテンツ",
    tickers: [],
    keywords: ["ゲーム", "アニメ", "ＩＰ", "IP", "カバー", "ＡＮＹＣＯＬＯＲ", "ANYCOLOR", "ブシロード", "ＩＧポート"],
  },
  {
    id: "fintech",
    label: "FinTech・決済",
    tickers: [],
    keywords: ["決済", "フィンテック", "FinTech", "ペイメント", "ＧＭＯフィナンシャル", "ウェルスナビ"],
  },
  {
    id: "cybersecurity",
    label: "サイバーセキュリティ",
    tickers: [],
    keywords: ["セキュリティ", "サイバー", "トレンドマイクロ", "ＦＦＲＩ", "FFRI", "カウリス"],
  },
  {
    id: "adtech",
    label: "広告・マーケティング",
    tickers: [],
    keywords: ["広告", "マーケティング", "アド", "ジーニー", "Ｍａｃｂｅｅ", "フリークアウト"],
  },
  {
    id: "robotics",
    label: "ロボティクス・自動化",
    tickers: [],
    keywords: ["ロボット", "ロボティクス", "自動化", "ＦＡ", "FA", "ティアンドエス"],
  },
  {
    id: "energy",
    label: "再生可能エネルギー",
    tickers: [],
    keywords: ["エナジー", "再生可能", "太陽光", "蓄電池", "グリーンエネルギー", "レノバ"],
  },
];

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

function themeOf(company: CompanyRow) {
  const source = `${company.company_name} ${meta(company)?.name ?? ""}`.toLowerCase();
  return (
    THEMES.find((theme) =>
      theme.tickers.includes(company.ticker) ||
      theme.keywords.some((keyword) => source.includes(keyword.toLowerCase()))
    ) ?? null
  );
}

function sameBusinessPriority(target: CompanyRow, peer: CompanyRow) {
  const targetTheme = themeOf(target);
  const peerTheme = themeOf(peer);
  if (targetTheme && peerTheme?.id === targetTheme.id) return 0;

  const targetMeta = meta(target);
  const peerMeta = meta(peer);
  if (targetMeta?.sector33 && peerMeta?.sector33 === targetMeta.sector33) return 1;
  if (targetMeta?.sector17 && peerMeta?.sector17 === targetMeta.sector17) return 2;
  return 3;
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
  const companyTheme = themeOf(company);
  const companyMeta = meta(company);

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
    theme: companyTheme?.label ?? null,
    sector33: companyMeta?.sector33 ?? null,
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

function businessSorted(target: CompanyRow, peers: CompanyRow[], distance: (peer: CompanyRow) => number) {
  return uniqueByTicker(peers)
    .filter((peer) => peer.ticker !== target.ticker && peer.risk_level !== "EXCLUDED")
    .sort((a, b) => {
      const businessGap = sameBusinessPriority(target, a) - sameBusinessPriority(target, b);
      if (businessGap !== 0) return businessGap;
      return distance(a) - distance(b);
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
  strictTheme = false,
}: {
  id: string;
  label: string;
  description: string;
  basis: string[];
  target: CompanyRow;
  peers: CompanyRow[];
  score: (peer: CompanyRow) => number;
  strictTheme?: boolean;
}) {
  const targetTheme = themeOf(target);
  const sameThemePeers = targetTheme
    ? peers.filter((peer) => themeOf(peer)?.id === targetTheme.id)
    : [];

  const source = strictTheme && sameThemePeers.length >= 2 ? sameThemePeers : peers;
  const sortedPeers = businessSorted(target, source, score).slice(0, 8);

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
    .limit(300);

  if (peerError) {
    return NextResponse.json({ error: "peer fetch failed" }, { status: 500 });
  }

  const candidatePeers = (peers ?? []) as CompanyRow[];
  const targetTheme = themeOf(targetCompany);
  const targetMeta = meta(targetCompany);
  const score = targetCompany.score ?? 0;
  const revenueGrowth = metric(targetCompany, "revenueGrowth");
  const comparisonLabel = targetTheme?.label ?? targetMeta?.sector33 ?? "事業・財務特性";

  const groups = [
    buildGroup({
      id: "peer",
      label: "事業テーマ比較",
      description: `${comparisonLabel}を最優先し、その中で財務指標が近い企業を並べています。`,
      basis: [comparisonLabel, "総合スコア", "収益性", "財務安全性"],
      target: targetCompany,
      peers: candidatePeers,
      score: (peer) => broadPeerDistance(targetCompany, peer),
      strictTheme: true,
    }),
    buildGroup({
      id: "financial",
      label: "財務類似企業",
      description: "事業テーマを優先したうえで、利益率・営業CF率・自己資本比率が近い企業です。",
      basis: [comparisonLabel, "営業利益率", "営業CF率", "自己資本比率"],
      target: targetCompany,
      peers: candidatePeers,
      score: (peer) => financialDistance(targetCompany, peer),
    }),
    buildGroup({
      id: "growth",
      label: "成長率が近い企業",
      description: "事業テーマを優先したうえで、売上成長率と粗利成長率が近い企業です。",
      basis: [comparisonLabel, "売上成長率", "粗利成長率", "営業利益率"],
      target: targetCompany,
      peers: candidatePeers,
      score: (peer) => growthDistance(targetCompany, peer),
    }),
    buildGroup({
      id: "rival",
      label: "ライバル候補",
      description: "事業テーマ・業種・スコア帯・成長ステージを総合して選んだ比較候補です。",
      basis: [comparisonLabel, "スコア帯", "Danger帯", "成長ステージ"],
      target: targetCompany,
      peers: candidatePeers.filter((peer) =>
        sameBusinessPriority(targetCompany, peer) <= 1 &&
        (Math.abs((peer.score ?? 0) - score) <= 22 || gap(metric(peer, "revenueGrowth"), revenueGrowth, 999) <= 25)
      ),
      score: (peer) => broadPeerDistance(targetCompany, peer) * 0.8 + gap(peer.score, score, 99),
    }),
  ];

  return NextResponse.json({
    ticker: targetCompany.ticker,
    companyName: targetCompany.company_name,
    peerBasis: "business-first",
    comparisonLabel,
    note: `比較対象は「${comparisonLabel}」を最優先し、同テーマ内で財務・成長率・スコア帯を比較しています。候補不足時のみ同じ業種へ範囲を広げます。`,
    groups,
    companies: groups[0]?.companies ?? [normalize(targetCompany, true)],
    disclaimer: "比較候補は事業テーマと財務データの理解補助であり、実際の競合関係や個別銘柄の売買判断を示すものではありません。",
  });
}
