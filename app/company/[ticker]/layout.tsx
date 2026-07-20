import type { Metadata } from "next";
import Link from "next/link";
import CompanyPageScrollReset from "@/components/company-page-scroll-reset";
import { loadRuntimeCompanyMasterMap } from "@/lib/company-master-runtime";
import { supabaseAdmin } from "@/lib/supabase";

type Props = {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
};

type FinancialHistoryRow = {
  year?: number | string;
  fiscalYear?: number | string;
  fiscalMonth?: number | string;
  fiscalPeriod?: string;
  periodEnd?: string;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
  cash?: number;
  assets?: number;
  netAssets?: number;
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp";

const marketLabels: Record<string, string> = {
  growth: "グロース市場",
  standard: "スタンダード市場",
  prime: "プライム市場",
  other: "その他市場",
};

const marketTones: Record<string, string> = {
  growth: "border-green-400/20 bg-green-500/10 text-green-200",
  standard: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200",
  prime: "border-violet-400/20 bg-violet-500/10 text-violet-200",
  other: "border-white/10 bg-white/5 text-slate-300",
};

function yenOku(value: number | null | undefined) {
  if (!value) return "";
  return `${(value / 100000000).toFixed(1)}億円`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatFinancialValue(value: unknown) {
  if (!isFiniteNumber(value)) return "—";
  return `${(value / 100000000).toLocaleString("ja-JP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} 億円`;
}

function historyPeriodKey(row: FinancialHistoryRow, index: number) {
  return String(
    row.periodEnd ??
      row.fiscalPeriod ??
      row.fiscalYear ??
      row.year ??
      `unknown-${index}`
  );
}

function historyPeriodOrder(row: FinancialHistoryRow) {
  if (row.periodEnd) {
    const timestamp = Date.parse(row.periodEnd);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const year = Number(row.fiscalYear ?? row.year ?? 0);
  const month = Number(row.fiscalMonth ?? 12);
  return year * 100 + month;
}

function historyPeriodLabel(row: FinancialHistoryRow) {
  if (row.fiscalPeriod) return row.fiscalPeriod;

  if (row.periodEnd) {
    const date = new Date(`${row.periodEnd}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月期`;
    }
  }

  const year = row.fiscalYear ?? row.year;
  return year ? `${year}年期` : "決算期不明";
}

function latestThreeHistory(history: unknown) {
  if (!Array.isArray(history)) return [] as FinancialHistoryRow[];

  const byPeriod = new Map<string, FinancialHistoryRow>();
  history.forEach((value, index) => {
    if (!value || typeof value !== "object") return;
    const row = value as FinancialHistoryRow;
    byPeriod.set(historyPeriodKey(row, index), row);
  });

  return [...byPeriod.values()]
    .sort((a, b) => historyPeriodOrder(a) - historyPeriodOrder(b))
    .slice(-3);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;

  const [{ data }, { data: marketData }] = await Promise.all([
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, company_name, score, danger_score, risk_level, financials, market_segment")
      .eq("ticker", ticker)
      .maybeSingle(),
    supabaseAdmin
      .from("all_market_companies")
      .select("market_segment, industry_name")
      .eq("ticker", ticker)
      .maybeSingle(),
  ]);

  if (!data) {
    return {
      title: `${ticker}の財務分析・決算評価 | 決算探偵`,
      description: `${ticker}の決算・財務指標・リスクシグナルを決算探偵で確認できます。`,
    };
  }

  const revenue = yenOku(data.financials?.revenue);
  const operatingIncome = yenOku(data.financials?.operatingIncome);
  const operatingCF = yenOku(data.financials?.operatingCF);
  const marketSegment = marketData?.market_segment || data.market_segment || "growth";
  const marketLabel = marketLabels[marketSegment] || marketLabels.other;
  const title = `${data.company_name}（${data.ticker}）の財務分析・決算評価 | 決算探偵`;
  const description = `${marketLabel}・${marketData?.industry_name || "業種未分類"}の${data.company_name}（${data.ticker}）。売上高${revenue ? ` ${revenue}` : ""}、営業利益${operatingIncome ? ` ${operatingIncome}` : ""}、営業CF${operatingCF ? ` ${operatingCF}` : ""}、総合スコア${data.score}、Danger Score${data.danger_score}を確認できます。`;
  const url = `${appUrl}/company/${data.ticker}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "決算探偵",
      type: "website",
      locale: "ja_JP",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CompanyLayout({ children, params }: Props) {
  const { ticker } = await params;
  const [masterMap, marketResult, analysisResult] = await Promise.all([
    loadRuntimeCompanyMasterMap(),
    supabaseAdmin
      .from("all_market_companies")
      .select(
        "market_segment, industry_name, scoring_model, data_quality, last_financial_update, listing_status"
      )
      .eq("ticker", ticker)
      .maybeSingle(),
    supabaseAdmin
      .from("company_analyses")
      .select("history")
      .eq("ticker", ticker)
      .maybeSingle(),
  ]);
  const master = masterMap.get(ticker);
  const market = marketResult.data;
  const marketSegment = market?.market_segment || "growth";
  const marketHref = marketSegment === "growth" ? "/" : `/${marketSegment}`;
  const rankingHref = marketSegment === "growth" ? "/ranking" : `/${marketSegment}/ranking`;
  const historyRows = latestThreeHistory(analysisResult.data?.history);

  return (
    <>
      <CompanyPageScrollReset ticker={ticker} />
      {market ? (
        <section className="bg-[#050816] px-4 pt-5 text-white sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs backdrop-blur-xl">
            <Link
              href={marketHref}
              className={`rounded-full border px-3 py-1 font-black ${marketTones[marketSegment] || marketTones.other}`}
            >
              {marketLabels[marketSegment] || marketLabels.other}
            </Link>
            {market.industry_name ? (
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-bold text-slate-300">
                {market.industry_name}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-bold text-slate-400">
              Score Model: {market.scoring_model}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-bold text-slate-400">
              Data: {market.data_quality}
            </span>
            <Link
              href={rankingHref}
              className="ml-auto rounded-full border border-white/10 bg-white/5 px-3 py-1 font-black text-slate-200 hover:bg-white/10"
            >
              市場ランキング →
            </Link>
          </div>
        </section>
      ) : null}

      {historyRows.length > 0 ? (
        <section className="bg-[#050816] px-4 pt-5 text-white sm:px-8">
          <div className="mx-auto max-w-7xl rounded-3xl border border-cyan-300/20 bg-cyan-400/5 p-4 backdrop-blur-xl sm:p-6">
            <p className="text-xs font-black tracking-[0.24em] text-cyan-300">FINANCIAL HISTORY</p>
            <h2 className="mt-2 text-2xl font-black">財務数値（直近3期）</h2>
            <p className="mt-2 text-sm text-slate-400">
              EDINET原本から取得した決算期ごとの数値です。
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[940px] w-full border-separate border-spacing-0 text-right text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="border-b border-white/10 px-3 py-3 text-left">決算期</th>
                    <th className="border-b border-white/10 px-3 py-3">売上高</th>
                    <th className="border-b border-white/10 px-3 py-3">営業利益</th>
                    <th className="border-b border-white/10 px-3 py-3">営業CF</th>
                    <th className="border-b border-white/10 px-3 py-3">現金</th>
                    <th className="border-b border-white/10 px-3 py-3">総資産</th>
                    <th className="border-b border-white/10 px-3 py-3">純資産</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row, index) => (
                    <tr key={historyPeriodKey(row, index)} className="text-slate-100">
                      <td className="border-b border-white/5 px-3 py-3 text-left font-black text-cyan-100">
                        {historyPeriodLabel(row)}
                      </td>
                      <td className="border-b border-white/5 px-3 py-3">{formatFinancialValue(row.revenue)}</td>
                      <td className="border-b border-white/5 px-3 py-3">{formatFinancialValue(row.operatingIncome)}</td>
                      <td className="border-b border-white/5 px-3 py-3">{formatFinancialValue(row.operatingCF)}</td>
                      <td className="border-b border-white/5 px-3 py-3">{formatFinancialValue(row.cash)}</td>
                      <td className="border-b border-white/5 px-3 py-3">{formatFinancialValue(row.assets)}</td>
                      <td className="border-b border-white/5 px-3 py-3">{formatFinancialValue(row.netAssets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {children}
      <section className="bg-[#050816] px-4 pb-12 text-white sm:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.25em] text-cyan-300">RELATED ANALYSIS</p>
          <h2 className="mt-2 text-2xl font-black">関連する企業・ランキングを確認</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            同じ事業テーマの企業や、成長性・収益性・営業CF・リスクのランキングとあわせて確認できます。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {master && master.themeId !== "other" ? (
              <Link
                href={`/themes/${master.themeId}`}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200 hover:bg-cyan-400/20"
              >
                {master.theme}の企業一覧
              </Link>
            ) : (
              <Link
                href="/themes"
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200 hover:bg-cyan-400/20"
              >
                テーマ別企業一覧
              </Link>
            )}
            <Link href={rankingHref} className="rounded-full border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-sm font-black text-violet-200">市場別ランキング</Link>
            <Link href="/ranking/revenue-growth" className="rounded-full border border-green-300/20 bg-green-400/10 px-4 py-2 text-sm font-black text-green-200">売上成長率</Link>
            <Link href="/ranking/operating-margin" className="rounded-full border border-yellow-300/20 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-200">営業利益率</Link>
            <Link href="/ranking/operating-cash-flow" className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200">営業CF</Link>
            <Link href="/ranking/risk-signal" className="rounded-full border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-black text-red-200">リスクシグナル</Link>
            <Link href="/features" className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-black text-slate-200">財務特徴から探す</Link>
          </div>
        </div>
      </section>
    </>
  );
}
