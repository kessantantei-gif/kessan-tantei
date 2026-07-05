import type { Metadata } from "next";
import Link from "next/link";
import {
  rankingCategories,
  rankingDefinitions,
} from "@/lib/rankings/definitions";
import { rankCompanies } from "@/lib/rankings/engine";
import { isPremiumRanking } from "@/lib/rankings/premium";
import type { RankingCategory, RankingCompany, RankingDefinition } from "@/lib/rankings/types";
import { supabaseAdmin } from "@/lib/supabase";

const canonical = "https://kessan-tantei.jp/ranking";
const title = "決算ランキング一覧｜グロース企業の財務スコア・成長率・営業CFランキング";
const description =
  "決算探偵のランキング一覧ページです。グロース企業を財務スコア、売上成長率、営業利益率、営業CF、自己資本比率、リスクシグナルなどで比較できます。";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: {
    title,
    description,
    url: canonical,
    siteName: "決算探偵",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "https://kessan-tantei.jp/og-image.png", width: 1200, height: 630, alt: "決算ランキング一覧" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["https://kessan-tantei.jp/og-image.png"],
  },
};

async function loadCompanies() {
  const { data } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, risk_level, financials, history, risk")
    .neq("risk_level", "EXCLUDED")
    .limit(1000);

  return (data ?? []) as RankingCompany[];
}

function getVisibleRankings(companies: RankingCompany[]) {
  return rankingDefinitions.filter((ranking) => rankCompanies(companies, ranking).length > 0);
}

function getVisibleRankingsByCategory(
  rankings: RankingDefinition[],
  categoryId: RankingCategory
) {
  return rankings.filter((ranking) => ranking.category === categoryId);
}

export default async function RankingsPage() {
  const companies = await loadCompanies();
  const visibleRankings = getVisibleRankings(companies);
  const visibleCategories = rankingCategories.filter(
    (category) => getVisibleRankingsByCategory(visibleRankings, category.id).length > 0
  );

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "決算ランキング一覧",
    description,
    url: canonical,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: visibleRankings.length,
      itemListElement: visibleRankings.map((ranking, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: ranking.title,
        url: `${canonical}/${ranking.slug}`,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),transparent_28%)]" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-16">
        <section className="max-w-4xl">
          <p className="text-xs font-bold tracking-[0.3em] text-green-300">GROWTH MARKET RANKING</p>
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">決算ランキング一覧</h1>
          <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">
            グロース企業を、総合評価・成長性・収益性・キャッシュ創出力・安全性・リスクシグナル・業種・テーマから比較できます。気になる切り口から決算を読み解いてみましょう。
          </p>
          <p className="mt-3 text-sm text-slate-500">
            公開中：{visibleRankings.length}ランキング
            <span className="ml-2 text-slate-600">対象企業があるランキングのみ表示しています。</span>
          </p>
        </section>

        <nav className="mt-8 flex flex-wrap gap-2" aria-label="ランキングカテゴリー">
          {visibleCategories.map((category) => (
            <a
              key={category.id}
              href={`#${category.id}`}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300 hover:border-green-400/40 hover:text-white"
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
                  {rankings.map((ranking) => {
                    const premium = isPremiumRanking(ranking);
                    return (
                      <Link
                        key={ranking.slug}
                        href={`/ranking/${ranking.slug}`}
                        className="group rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:-translate-y-0.5 hover:border-green-400/40 hover:bg-green-500/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-black">{ranking.shortTitle}</h3>
                          {premium ? (
                            <span className="shrink-0 rounded-full bg-yellow-400 px-2 py-0.5 text-[11px] font-black text-slate-950">
                              Pro
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{ranking.description}</p>
                        <span className="mt-4 inline-block text-sm font-bold text-green-300">
                          {premium ? "Proで見る" : "見る"} <span className="transition group-hover:translate-x-1">→</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <section className="mt-10 rounded-3xl border border-white/10 bg-[#07111f] p-6 sm:p-8">
          <h2 className="text-2xl font-black">決算ランキングの見方</h2>
          <div className="mt-5 grid gap-6 leading-8 text-slate-300 md:grid-cols-3">
            <p><strong className="text-green-300">1. 切り口を選ぶ</strong><br />知りたい観点に近いカテゴリーと指標を選びます。</p>
            <p><strong className="text-green-300">2. 数字の差を見る</strong><br />順位だけでなく、企業間で数値がどれだけ違うかを確認します。</p>
            <p><strong className="text-green-300">3. 複数指標で確かめる</strong><br />企業ページや関連ランキングから、決算を多面的に確認します。</p>
          </div>
        </section>

        <p className="mt-8 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-xs leading-6 text-slate-400">
          本ページは決算情報の理解を補助することを目的としており、特定の銘柄の売買を推奨するものではありません。投資判断はご自身の責任で行ってください。
        </p>
      </div>
    </main>
  );
}
