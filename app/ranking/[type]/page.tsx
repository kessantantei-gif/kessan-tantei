import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import CompanySearch from "@/components/company-search";
import RankingResults from "@/components/ranking-results";
import { loadRankingCompanies } from "@/lib/load-ranking-companies";
import { isProUser } from "@/lib/pro-engine";
import {
  getRankingDefinition,
  getRelatedRankings,
} from "@/lib/rankings/definitions";
import { rankCompanies } from "@/lib/rankings/engine";
import { isPremiumRanking } from "@/lib/rankings/premium";
import type { RankingCompany } from "@/lib/rankings/types";

type PageProps = {
  params: Promise<{ type: string }>;
};

const siteUrl = "https://kessan-tantei.jp";
export const dynamic = "force-dynamic";

const legacyAliases: Record<string, string> = {
  "operating-cf": "operating-cash-flow",
  danger: "risk-signal",
  "risk-signals": "risk-signal",
};

const REVENUE_GROWTH_BASIS_SLUGS = new Set([
  "revenue-growth",
  "high-growth",
  "profitable-high-growth",
  "featured-companies",
  "recommended",
  "rule-of-40",
  "rule40-excellent",
]);

function resolveSlug(slug: string) {
  return legacyAliases[slug] ?? slug;
}

function usesRevenueGrowthBasis(slug: string) {
  return REVENUE_GROWTH_BASIS_SLUGS.has(slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params;
  const definition = getRankingDefinition(resolveSlug(type));

  if (!definition) return {};

  const title = `${definition.title}｜グロース企業の決算比較｜決算探偵`;
  const canonical = `${siteUrl}/ranking/${definition.slug}`;

  return {
    title,
    description: definition.description,
    alternates: { canonical },
    openGraph: {
      title,
      description: definition.description,
      url: canonical,
      siteName: "決算探偵",
      locale: "ja_JP",
      type: "website",
      images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: definition.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: definition.description,
      images: [`${siteUrl}/og-image.png`],
    },
  };
}


export default async function RankingPage({ params }: PageProps) {
  const { type } = await params;
  const slug = resolveSlug(type);

  if (slug !== type) permanentRedirect(`/ranking/${slug}`);

  const definition = getRankingDefinition(slug);
  if (!definition) notFound();

  const companies = await loadRankingCompanies("growth");
  const rankings = rankCompanies(companies, definition);
  const relatedRankings = getRelatedRankings(definition);
  const isPro = await isProUser();
  const premium = isPremiumRanking(definition);
  const showRevenueGrowthBasis = usesRevenueGrowthBasis(definition.slug);
  const searchCompanies = companies.map((company) => ({
    ticker: company.ticker,
    company_name: company.company_name,
    score: company.score,
    danger_score: company.danger_score,
  }));

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: definition.title,
    description: definition.description,
    url: `${siteUrl}/ranking/${definition.slug}`,
    numberOfItems: isPro ? rankings.length : Math.min(rankings.length, 3),
    itemListElement: (isPro ? rankings : rankings.slice(0, 3)).map(({ company }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: company.company_name,
      url: `${siteUrl}/company/${company.ticker}`,
    })),
  };

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),transparent_28%)]" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      <header className="relative z-10 border-b border-white/10 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
          <Link href="/" className="text-2xl font-black sm:text-3xl">決算探偵</Link>
          <Link href="/ranking" className="text-sm text-slate-400 hover:text-white">
            ← ランキング一覧
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.3em] text-green-300">GROWTH MARKET RANKING</p>
              <h1 className="mt-4 text-3xl font-black sm:text-5xl">{definition.title}</h1>
              <p className="mt-4 max-w-3xl leading-8 text-slate-300">{definition.description}</p>
              <p className="mt-3 text-sm text-slate-500">
                {isPro ? `対象企業数：${rankings.length}社` : `TOP3無料 / 全${rankings.length}社`}
              </p>
            </div>
            {premium ? (
              <span className="w-fit rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-slate-950">
                Pro詳細
              </span>
            ) : null}
          </div>

          {showRevenueGrowthBasis ? (
            <div className="mt-6 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm leading-7 text-yellow-50">
              <p className="font-black text-yellow-200">売上成長率ランキングの集計基準</p>
              <p className="mt-2 text-yellow-50/90">
                売上成長率は、会社ページの履歴データにある直近2期の売上高から再計算しています。前期売上が1億円未満の場合、母数が小さすぎて数千%の成長率になりやすいため、通常の売上成長率ランキング・高成長判定・Rule of 40からは除外しています。
              </p>
            </div>
          ) : null}

          <div className="mt-6 max-w-3xl">
            <CompanySearch companies={searchCompanies} />
          </div>
        </section>

        <section className="mt-8" aria-label={definition.title}>
          <RankingResults definition={definition} rankings={rankings} isPro={isPro} />
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
            <h2 className="text-2xl font-black">このランキングで分かること</h2>
            <p className="mt-4 leading-8 text-slate-300">{definition.guide}</p>
            <p className="mt-3 leading-8 text-slate-300">
              無料ではTOP3を確認できます。4位以降や全順位を比較したい場合は、Proで詳細を確認してください。
            </p>
          </section>

          <section className="rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-6 sm:p-8">
            <h2 className="text-2xl font-black">注意点</h2>
            <p className="mt-4 leading-8 text-slate-300">{definition.caution}</p>
            {showRevenueGrowthBasis ? (
              <p className="mt-3 leading-8 text-slate-300">
                前期売上が小さい会社は、成長率の数字が極端に大きくなりやすいため、このランキングでは前期売上1億円以上の会社を通常比較の対象にしています。売上が立ち上がった会社は、別途「急増・立ち上がり」系の切り口で確認するのが適しています。
              </p>
            ) : null}
            <p className="mt-3 text-sm leading-7 text-slate-400">
              データの更新時点や会計基準、企業ごとの決算期の違いにより、単純比較が適さない場合があります。
            </p>
          </section>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#07111f] p-6 sm:p-8">
          <h2 className="text-2xl font-black">関連ランキング</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {relatedRankings.map((related) => {
              const relatedPremium = isPremiumRanking(related);
              return (
                <Link
                  key={related.slug}
                  href={`/ranking/${related.slug}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 font-bold transition hover:border-green-400/40 hover:bg-green-500/10"
                >
                  {relatedPremium ? "🔒 " : ""}{related.shortTitle}<span className="ml-2 text-green-300">→</span>
                </Link>
              );
            })}
          </div>
        </section>

        <p className="mt-8 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-xs leading-6 text-slate-400">
          本ページは決算情報の理解を補助することを目的としており、特定の銘柄の売買を推奨するものではありません。投資判断はご自身の責任で行ってください。
        </p>
      </div>
    </main>
  );
}
