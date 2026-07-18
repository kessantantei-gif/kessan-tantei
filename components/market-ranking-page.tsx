import Link from "next/link";
import { loadRankingCompanies } from "@/lib/load-ranking-companies";
import { marketDefinitions, type MarketSlug } from "@/lib/markets";
import {
  rankingCategories,
  rankingDefinitions,
} from "@/lib/rankings/definitions";
import { rankCompanies } from "@/lib/rankings/engine";
import type {
  RankedCompany,
  RankingCategory,
  RankingCompany,
  RankingDefinition,
} from "@/lib/rankings/types";
import { isProUser, FREE_VISIBLE_S_RANK_LIMIT } from "@/lib/pro-engine";

type MarketPageSlug = Exclude<MarketSlug, "growth">;

const COMPARISON_REQUIRED_SLUGS = new Set([
  "revenue-growth",
  "high-growth",
  "profitable-high-growth",
  "featured-companies",
  "recommended",
  "rule-of-40",
  "rule40-excellent",
  "gross-profit-growth",
  "operating-income-growth",
  "net-income-growth",
  "ocf-growth",
  "revenue-cagr-3y",
  "margin-improvement",
  "ocf-improvement",
]);

const toneClasses = {
  standard: {
    eyebrow: "text-cyan-300",
    badge: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
    hover: "hover:border-cyan-400/40 hover:bg-cyan-500/10",
    link: "text-cyan-300",
  },
  prime: {
    eyebrow: "text-violet-300",
    badge: "border-violet-400/30 bg-violet-500/10 text-violet-200",
    hover: "hover:border-violet-400/40 hover:bg-violet-500/10",
    link: "text-violet-300",
  },
} as const;


function shouldKeepEmptyRanking(ranking: RankingDefinition) {
  return COMPARISON_REQUIRED_SLUGS.has(ranking.slug);
}

function getVisibleRankings(companies: RankingCompany[]) {
  return rankingDefinitions.filter((ranking) => {
    const hasCompanies = rankCompanies(companies, ranking).length > 0;
    return hasCompanies || shouldKeepEmptyRanking(ranking);
  });
}

function getVisibleRankingsByCategory(
  rankings: RankingDefinition[],
  categoryId: RankingCategory
) {
  return rankings.filter((ranking) => ranking.category === categoryId);
}

function displayRankingValue(result: RankedCompany, ranking: RankingDefinition) {
  return ranking.formatValue(result.value);
}

export default async function MarketRankingPage({
  marketSlug,
  rankingSlug,
}: {
  marketSlug: MarketPageSlug;
  rankingSlug?: string;
}) {
  const market = marketDefinitions[marketSlug];
  const tone = toneClasses[marketSlug];
  const [companies, pro] = await Promise.all([
    loadRankingCompanies(marketSlug),
    isProUser(),
  ]);

  const visibleRankings = getVisibleRankings(companies);
  const visibleCategories = rankingCategories.filter(
    (category) => getVisibleRankingsByCategory(visibleRankings, category.id).length > 0
  );
  const selectedRanking = rankingSlug
    ? rankingDefinitions.find((ranking) => ranking.slug === rankingSlug)
    : null;

  if (selectedRanking) {
    const rankedCompanies = rankCompanies(companies, selectedRanking);
    const visibleCompanies = pro
      ? rankedCompanies
      : rankedCompanies.slice(0, FREE_VISIBLE_S_RANK_LIMIT);
    const lockedCount = Math.max(0, rankedCompanies.length - visibleCompanies.length);

    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
          <Link
            href={`/${marketSlug}/ranking`}
            className={`text-sm font-bold ${tone.link} hover:text-white`}
          >
            ← ランキング一覧へ戻る
          </Link>

          <section className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
            <p className={`text-xs font-bold tracking-[0.3em] ${tone.eyebrow}`}>
              {market.englishName.toUpperCase()} MARKET RANKING
            </p>
            <h1 className="mt-4 text-3xl font-black sm:text-5xl">
              {selectedRanking.title}
            </h1>
            <p className="mt-4 text-base leading-8 text-slate-300">
              {selectedRanking.description}
            </p>
            <p className="mt-3 text-sm text-slate-500">
              対象：{rankedCompanies.length}社
              {!pro
                ? ` ／ 無料では上位${Math.min(FREE_VISIBLE_S_RANK_LIMIT, rankedCompanies.length)}社まで表示`
                : " ／ Proでは全件表示"}
            </p>
          </section>

          <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            {visibleCompanies.length === 0 ? (
              <p className="p-8 text-center text-slate-400">
                このランキングは比較データがまだ不足しています。
              </p>
            ) : (
              <>
                <div className="divide-y divide-white/10">
                  {visibleCompanies.map((result, index) => {
                    const company = result.company;
                    return (
                      <Link
                        key={company.ticker}
                        href={`/company/${company.ticker}`}
                        className="grid grid-cols-[52px_1fr_auto] items-center gap-3 p-4 transition hover:bg-white/10 sm:p-5"
                      >
                        <span className="text-center text-lg font-black text-slate-400">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">{company.company_name}</p>
                          <p className="mt-1 text-xs text-slate-500">{company.ticker}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-white">
                            {displayRankingValue(result, selectedRanking)}
                          </p>
                          <p className="mt-1 text-[10px] font-bold text-slate-500">
                            {selectedRanking.metricLabel}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {!pro && lockedCount > 0 ? (
                  <div className="border-t border-yellow-300/20 bg-yellow-400/10 p-6 text-center sm:p-8">
                    <p className="text-xs font-black tracking-[0.25em] text-yellow-200">PRO RANKING</p>
                    <h2 className="mt-3 text-2xl font-black">残り{lockedCount}社の順位を見る</h2>
                    <Link
                      href="/pricing"
                      className="mt-5 inline-flex rounded-full bg-yellow-400 px-6 py-3 font-black text-slate-950 hover:bg-yellow-300"
                    >
                      Proで全順位を表示
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.12),transparent_32%),radial-gradient(circle_at_top_left,_rgba(139,92,246,0.12),transparent_28%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-16">
        <section className="max-w-4xl">
          <p className={`text-xs font-bold tracking-[0.3em] ${tone.eyebrow}`}>
            {market.englishName.toUpperCase()} MARKET RANKING
          </p>
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">決算ランキング一覧</h1>
          <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">
            {market.name}の企業を、総合評価・成長性・収益性・キャッシュ創出力・安全性・リスクシグナル・業種・テーマから比較できます。
          </p>
          <p className="mt-3 text-sm text-slate-500">
            公開中：{visibleRankings.length}ランキング ／ 解析対象：{companies.length}社
          </p>
        </section>

        <nav className="mt-8 flex flex-wrap gap-2" aria-label="ランキングカテゴリー">
          {visibleCategories.map((category) => (
            <a
              key={category.id}
              href={`#${category.id}`}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300 hover:border-white/30 hover:text-white"
            >
              {category.icon} {category.title}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-8">
          {visibleCategories.map((category) => {
            const rankings = getVisibleRankingsByCategory(visibleRankings, category.id);
            return (
              <section
                key={category.id}
                id={category.id}
                className="scroll-mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8"
              >
                <div className="flex items-start gap-4">
                  <span className="text-3xl" aria-hidden="true">{category.icon}</span>
                  <div>
                    <h2 className="text-2xl font-black sm:text-3xl">{category.title}ランキング</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{category.description}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {rankings.map((ranking) => (
                    <Link
                      key={ranking.slug}
                      href={`/${marketSlug}/ranking?type=${ranking.slug}`}
                      className={`group rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:-translate-y-0.5 ${tone.hover}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-black">{ranking.shortTitle}</h3>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${tone.badge}`}>
                          TOP3無料
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                        {ranking.description}
                      </p>
                      <span className={`mt-4 inline-block text-sm font-bold ${tone.link}`}>
                        見る <span className="transition group-hover:translate-x-1">→</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
