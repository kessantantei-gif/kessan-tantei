import type { Metadata } from "next";
import Link from "next/link";
import CompanyPageScrollReset from "@/components/company-page-scroll-reset";
import CompanyMarketBadges from "@/components/company-market-badges";
import { loadRuntimeCompanyMasterMap } from "@/lib/company-master-runtime";
import { supabaseAdmin } from "@/lib/supabase";

type Props = {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp";

const marketLabels: Record<string, string> = {
  growth: "グロース市場",
  standard: "スタンダード市場",
  prime: "プライム市場",
  other: "その他市場",
};

function yenOku(value: number | null | undefined) {
  if (!value) return "";
  return `${(value / 100000000).toFixed(1)}億円`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;

  const [{ data }, { data: marketData }] = await Promise.all([
    supabaseAdmin
      .from("company_analyses")
      .select(
        "ticker, company_name, score, danger_score, risk_level, financials, market_segment"
      )
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
  const marketSegment =
    marketData?.market_segment || data.market_segment || "growth";
  const marketLabel = marketLabels[marketSegment] || marketLabels.other;
  const title = `${data.company_name}（${data.ticker}）の財務分析・決算評価 | 決算探偵`;
  const description = `${marketLabel}・${
    marketData?.industry_name || "業種未分類"
  }の${data.company_name}（${data.ticker}）。売上高${
    revenue ? ` ${revenue}` : ""
  }、営業利益${operatingIncome ? ` ${operatingIncome}` : ""}、営業CF${
    operatingCF ? ` ${operatingCF}` : ""
  }、総合スコア${data.score}、Danger Score${
    data.danger_score
  }を確認できます。`;
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
  const [masterMap, marketResult] = await Promise.all([
    loadRuntimeCompanyMasterMap(),
    supabaseAdmin
      .from("all_market_companies")
      .select("market_segment, industry_name")
      .eq("ticker", ticker)
      .maybeSingle(),
  ]);
  const master = masterMap.get(ticker);
  const market = marketResult.data;
  const marketSegment = market?.market_segment || "growth";
  const marketLabel = marketLabels[marketSegment] || marketLabels.other;
  const rankingHref =
    marketSegment === "growth" ? "/ranking" : `/${marketSegment}/ranking`;
  const themeHref =
    master && master.themeId !== "other"
      ? `/themes/${master.themeId}`
      : "/themes";
  const themeLabel =
    master && master.themeId !== "other"
      ? `${master.theme}の企業一覧`
      : "テーマ別企業一覧";
  const relatedLinks = [
    { href: themeHref, kicker: "THEME", label: themeLabel },
    { href: rankingHref, kicker: "MARKET", label: "市場別ランキング" },
    {
      href: "/ranking/revenue-growth",
      kicker: "GROWTH",
      label: "売上成長率",
    },
    {
      href: "/ranking/operating-margin",
      kicker: "PROFIT",
      label: "営業利益率",
    },
    {
      href: "/ranking/operating-cash-flow",
      kicker: "CASH FLOW",
      label: "営業CF",
    },
    {
      href: "/ranking/risk-signal",
      kicker: "RISK",
      label: "リスクシグナル",
    },
  ];

  return (
    <>
      <CompanyPageScrollReset ticker={ticker} />
      {children}
      {market ? (
        <CompanyMarketBadges
          ticker={ticker}
          marketSegment={marketSegment}
          marketLabel={marketLabel}
          industryName={market.industry_name}
        />
      ) : null}
      <section className="bg-[#050816] px-4 pb-12 text-white sm:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-8">
          <p className="text-xs font-black tracking-[0.25em] text-cyan-300">
            RELATED ANALYSIS
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            関連する分析を見る
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:leading-7">
            同じテーマの企業や、市場・財務指標・リスクのランキングを確認できます。
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {relatedLinks.map((item) => (
              <Link
                key={`${item.kicker}-${item.href}`}
                href={item.href}
                data-pressable="true"
                className="group flex min-h-[92px] min-w-0 flex-col justify-between rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/35 hover:bg-white/[0.07]"
              >
                <span className="text-[10px] font-bold tracking-[0.18em] text-slate-500">
                  {item.kicker}
                </span>
                <span className="mt-2 text-sm font-black leading-5 text-slate-100 sm:text-base">
                  {item.label}
                </span>
                <span className="mt-3 text-xs font-bold text-cyan-300">
                  確認する →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
