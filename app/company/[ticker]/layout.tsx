import Link from "next/link";
import { unstable_cache } from "next/cache";
import CompanyPageScrollReset from "@/components/company-page-scroll-reset";
import CompanyMarketBadges from "@/components/company-market-badges";
import CompanyPageVisualEnhancer from "@/components/company-page-visual-enhancer";
import { loadRuntimeCompanyMasterEntry } from "@/lib/company-master-runtime";
import { supabaseAdmin } from "@/lib/supabase";

type Props = {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp";
const earningsTypes = [
  "q1_earnings",
  "q2_earnings",
  "q3_earnings",
  "annual_earnings",
  "correction",
];

const marketLabels: Record<string, string> = {
  growth: "グロース市場",
  standard: "スタンダード市場",
  prime: "プライム市場",
  other: "その他市場",
};

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const loadCompanyLayoutContext = unstable_cache(
  async (ticker: string) => {
    const [master, marketResult, disclosureResult] = await Promise.all([
      loadRuntimeCompanyMasterEntry(ticker),
      supabaseAdmin
        .from("all_market_companies")
        .select("market_segment, industry_name, last_financial_update, updated_at")
        .eq("ticker", ticker)
        .maybeSingle(),
      supabaseAdmin
        .from("company_disclosures")
        .select("title, disclosed_at")
        .eq("ticker", ticker)
        .eq("source", "tdnet")
        .in("document_type", earningsTypes)
        .order("disclosed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      master,
      market: marketResult.data,
      latestDisclosure: disclosureResult.data,
    };
  },
  ["company-layout-context-v2"],
  { revalidate: 1800 }
);

export default async function CompanyLayout({ children, params }: Props) {
  const { ticker } = await params;
  const { master, market, latestDisclosure } = await loadCompanyLayoutContext(ticker);
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
      href: "/latest-earnings",
      kicker: "EARNINGS",
      label: "最新決算一覧",
    },
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

  const companyUrl = `${appUrl}/company/${ticker}`;
  const companyName = master?.companyName ?? ticker;
  const dateModified =
    latestDisclosure?.disclosed_at ??
    market?.last_financial_update ??
    market?.updated_at ??
    undefined;
  const companyDescription = latestDisclosure?.title
    ? `${companyName}（${ticker}）の最新決算「${latestDisclosure.title}」と財務分析。`
    : `${companyName}（${ticker}）の決算・財務分析。`;

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${companyName}（${ticker}）の決算・財務分析`,
    url: companyUrl,
    description: companyDescription,
    inLanguage: "ja-JP",
    ...(dateModified ? { dateModified } : {}),
    isPartOf: {
      "@type": "WebSite",
      name: "決算探偵",
      url: appUrl,
    },
    about: {
      "@type": "Corporation",
      name: companyName,
      tickerSymbol: ticker,
      description: [marketLabel, market?.industry_name].filter(Boolean).join("・"),
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "決算探偵",
        item: `${appUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: marketLabel,
        item: `${appUrl}/markets`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${companyName}（${ticker}）`,
        item: companyUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(webPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />
      <CompanyPageScrollReset ticker={ticker} />
      {children}
      <CompanyPageVisualEnhancer />
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
            同じテーマの企業や、市場・最新決算・財務指標・リスクのランキングを確認できます。
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
