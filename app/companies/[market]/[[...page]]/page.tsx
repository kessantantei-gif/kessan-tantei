import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  MARKET_COMPANY_PAGE_SIZE,
  loadMarketCompanyDirectory,
  type MarketDirectoryCompany,
} from "@/lib/market-company-directory";
import {
  getMarketDefinition,
  marketList,
  type MarketSlug,
} from "@/lib/markets";

const siteUrl = "https://kessan-tantei.jp";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{
    market: string;
    page?: string[];
  }>;
};

const toneClasses: Record<
  MarketSlug,
  {
    eyebrow: string;
    border: string;
    panel: string;
    button: string;
    glow: string;
  }
> = {
  growth: {
    eyebrow: "text-green-300",
    border: "border-green-400/25",
    panel: "bg-green-500/10",
    button: "bg-green-300 text-slate-950 hover:bg-green-200",
    glow:
      "bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.14),transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(21,128,61,0.12),transparent_36%)]",
  },
  standard: {
    eyebrow: "text-cyan-300",
    border: "border-cyan-400/25",
    panel: "bg-cyan-500/10",
    button: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
    glow:
      "bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(14,116,144,0.12),transparent_36%)]",
  },
  prime: {
    eyebrow: "text-violet-300",
    border: "border-violet-400/25",
    panel: "bg-violet-500/10",
    button: "bg-violet-300 text-slate-950 hover:bg-violet-200",
    glow:
      "bg-[radial-gradient(circle_at_top_right,_rgba(139,92,246,0.15),transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.12),transparent_36%)]",
  },
};

function pageNumberFromParts(parts?: string[]) {
  if (!parts || parts.length === 0) return 1;
  if (parts.length !== 1 || !/^\d+$/.test(parts[0])) return null;
  const pageNumber = Number(parts[0]);
  return Number.isSafeInteger(pageNumber) && pageNumber >= 1 ? pageNumber : null;
}

function pagePath(market: MarketSlug, pageNumber: number) {
  return pageNumber <= 1
    ? `/companies/${market}`
    : `/companies/${market}/${pageNumber}`;
}

function formatDate(value: string | null) {
  if (!value) return "更新日確認中";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新日確認中";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function paginationNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const values = new Set<number>([
    1,
    2,
    totalPages - 1,
    totalPages,
    currentPage - 2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    currentPage + 2,
  ]);

  return [...values]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolved = await params;
  const market = getMarketDefinition(resolved.market);
  const pageNumber = pageNumberFromParts(resolved.page);

  if (!market || pageNumber === null) {
    return {
      title: "企業一覧 | 決算探偵",
      robots: { index: false, follow: true },
    };
  }

  const companies = await loadMarketCompanyDirectory(market.slug);
  const totalPages = Math.max(
    1,
    Math.ceil(companies.length / MARKET_COMPANY_PAGE_SIZE)
  );

  if (pageNumber > totalPages) {
    return {
      title: `${market.name}の企業一覧 | 決算探偵`,
      robots: { index: false, follow: true },
    };
  }

  const canonical = pagePath(market.slug, pageNumber);
  const rangeStart = (pageNumber - 1) * MARKET_COMPANY_PAGE_SIZE + 1;
  const rangeEnd = Math.min(
    pageNumber * MARKET_COMPANY_PAGE_SIZE,
    companies.length
  );
  const pageLabel = pageNumber === 1 ? "" : `（${pageNumber}ページ目）`;
  const title = `${market.name}の企業一覧${pageLabel} | 決算探偵`;
  const description = `${market.name}の上場企業${companies.length}社を証券コード順に掲載。${rangeStart}社目から${rangeEnd}社目までの会社情報を確認でき、分析済み企業では財務スコア、Danger Score、売上成長率、営業利益率も確認できます。`;
  const url = `${siteUrl}${canonical}`;
  const image = `${siteUrl}/markets/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: "決算探偵",
      locale: "ja_JP",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function MarketCompanyDirectoryPage({ params }: PageProps) {
  const resolved = await params;
  const market = getMarketDefinition(resolved.market);
  const pageNumber = pageNumberFromParts(resolved.page);

  if (!market || pageNumber === null) notFound();

  if (pageNumber === 1 && resolved.page?.length) {
    redirect(pagePath(market.slug, 1));
  }

  const companies = await loadMarketCompanyDirectory(market.slug);
  const totalPages = Math.max(
    1,
    Math.ceil(companies.length / MARKET_COMPANY_PAGE_SIZE)
  );

  if (companies.length === 0 || pageNumber > totalPages) notFound();

  const analyzedCount = companies.filter((company) => company.analyzed).length;
  const startIndex = (pageNumber - 1) * MARKET_COMPANY_PAGE_SIZE;
  const visibleCompanies = companies.slice(
    startIndex,
    startIndex + MARKET_COMPANY_PAGE_SIZE
  );
  const tone = toneClasses[market.slug];
  const canonicalPath = pagePath(market.slug, pageNumber);
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const rangeStart = startIndex + 1;
  const rangeEnd = startIndex + visibleCompanies.length;
  const pageNumbers = paginationNumbers(pageNumber, totalPages);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${market.name}の企業一覧`,
    url: canonicalUrl,
    numberOfItems: visibleCompanies.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: visibleCompanies.map((company, index) => ({
      "@type": "ListItem",
      position: startIndex + index + 1,
      name: `${company.companyName}（${company.ticker}）`,
      url: `${siteUrl}/company/${company.ticker}`,
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "決算探偵",
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "市場を選ぶ",
        item: `${siteUrl}/markets`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${market.name}の企業一覧`,
        item: `${siteUrl}/companies/${market.slug}`,
      },
      ...(pageNumber > 1
        ? [
            {
              "@type": "ListItem",
              position: 4,
              name: `${pageNumber}ページ目`,
              item: canonicalUrl,
            },
          ]
        : []),
    ],
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className={`pointer-events-none absolute inset-0 ${tone.glow}`} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-16">
        <nav className="text-sm text-slate-400" aria-label="パンくず">
          <Link href="/markets" className="hover:text-white">
            市場を選ぶ
          </Link>
          <span className="mx-2">/</span>
          <span>{market.name}の企業一覧</span>
          {pageNumber > 1 ? (
            <>
              <span className="mx-2">/</span>
              <span>{pageNumber}ページ目</span>
            </>
          ) : null}
        </nav>

        <header className={`mt-6 rounded-3xl border ${tone.border} ${tone.panel} p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-10`}>
          <p className={`text-xs font-black tracking-[0.28em] ${tone.eyebrow}`}>
            {market.englishName.toUpperCase()} COMPANY DIRECTORY
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">
            {market.name}の企業一覧
          </h1>
          <p className="mt-5 max-w-4xl text-sm leading-7 text-slate-300 sm:text-lg sm:leading-8">
            {market.name}の上場企業{companies.length}社を、証券コード順に掲載しています。
            分析済み企業では決算・財務指標・スコア・リスクシグナルを確認でき、分析準備中の企業も基本情報と直近開示を同じURLで確認できます。
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {marketList.map((item) => {
              const active = item.slug === market.slug;
              return (
                <Link
                  key={item.slug}
                  href={`/companies/${item.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                    active
                      ? `${tone.button} border-transparent`
                      : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-slate-400">上場企業</p>
              <p className="mt-2 text-3xl font-black">{companies.length}社</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-slate-400">分析済み企業</p>
              <p className="mt-2 text-3xl font-black">{analyzedCount}社</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-slate-400">現在の表示範囲</p>
              <p className="mt-2 text-2xl font-black">
                {rangeStart}〜{rangeEnd}社目
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-slate-400">ページ</p>
              <p className="mt-2 text-2xl font-black">
                {pageNumber} / {totalPages}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-8" aria-labelledby="company-list-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={`text-xs font-black tracking-[0.24em] ${tone.eyebrow}`}>
                INDEXABLE COMPANIES
              </p>
              <h2 id="company-list-heading" className="mt-2 text-2xl font-black sm:text-3xl">
                {rangeStart}社目から{rangeEnd}社目
              </h2>
            </div>
            <Link
              href={market.href}
              className="text-sm font-bold text-slate-300 hover:text-white"
            >
              {market.name}トップへ戻る →
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleCompanies.map((company) => (
              <CompanyCard key={company.ticker} company={company} tone={tone} />
            ))}
          </div>
        </section>

        <nav
          className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
          aria-label="企業一覧のページ送り"
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            {pageNumber > 1 ? (
              <Link
                href={pagePath(market.slug, pageNumber - 1)}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10"
              >
                ← 前へ
              </Link>
            ) : null}

            {pageNumbers.map((number, index) => {
              const previous = pageNumbers[index - 1];
              const showGap = previous !== undefined && number - previous > 1;
              const active = number === pageNumber;
              return (
                <span key={number} className="contents">
                  {showGap ? <span className="px-1 text-slate-500">…</span> : null}
                  <Link
                    href={pagePath(market.slug, number)}
                    aria-current={active ? "page" : undefined}
                    className={`min-w-10 rounded-xl border px-3 py-2 text-center text-sm font-black transition ${
                      active
                        ? `${tone.button} border-transparent`
                        : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {number}
                  </Link>
                </span>
              );
            })}

            {pageNumber < totalPages ? (
              <Link
                href={pagePath(market.slug, pageNumber + 1)}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10"
              >
                次へ →
              </Link>
            ) : null}
          </div>
        </nav>
      </section>
    </main>
  );
}

function CompanyCard({
  company,
  tone,
}: {
  company: MarketDirectoryCompany;
  tone: (typeof toneClasses)[MarketSlug];
}) {
  return (
    <Link
      href={`/company/${company.ticker}`}
      className={`group min-w-0 rounded-2xl border ${tone.border} bg-white/5 p-5 transition hover:-translate-y-0.5 hover:bg-white/10`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-black tracking-[0.16em] ${tone.eyebrow}`}>
            {company.ticker}
          </p>
          <h3 className="mt-2 truncate text-lg font-black text-white">
            {company.companyName}
          </h3>
          <p className="mt-1 truncate text-xs text-slate-400">
            {company.industryName}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-black text-slate-200">
          {company.analyzed && company.score !== null ? `${company.score}点` : "分析準備中"}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-black/20 p-3">
          <dt className="text-[10px] text-slate-500">売上成長率</dt>
          <dd className="mt-1 text-sm font-black text-slate-100">
            {formatPercent(company.revenueGrowth)}
          </dd>
        </div>
        <div className="rounded-xl bg-black/20 p-3">
          <dt className="text-[10px] text-slate-500">営業利益率</dt>
          <dd className="mt-1 text-sm font-black text-slate-100">
            {formatPercent(company.operatingMargin)}
          </dd>
        </div>
        <div className="rounded-xl bg-black/20 p-3">
          <dt className="text-[10px] text-slate-500">Danger</dt>
          <dd className="mt-1 text-sm font-black text-slate-100">
            {company.dangerScore === null ? "—" : `${company.dangerScore}点`}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="truncate text-slate-500">
          更新：{formatDate(company.lastUpdated)}
        </span>
        <span className={`shrink-0 font-black ${tone.eyebrow}`}>
          {company.analyzed ? "分析を見る →" : "企業情報を見る →"}
        </span>
      </div>
    </Link>
  );
}
