import Link from "next/link";
import type { MarketSlug } from "@/lib/markets";
import { marketDefinitions } from "@/lib/markets";
import { supabaseAdmin } from "@/lib/supabase";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";
import { isProUser, FREE_VISIBLE_S_RANK_LIMIT } from "@/lib/pro-engine";
import RankingCard, { type RankingCompany } from "@/components/RankingCard";
import CompanySearch from "@/components/company-search";

const toneClasses = {
  standard: {
    eyebrow: "text-cyan-300",
    panel: "border-cyan-400/20 bg-cyan-500/10",
    button: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
    glow:
      "bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(14,116,144,0.14),transparent_35%)]",
  },
  prime: {
    eyebrow: "text-violet-300",
    panel: "border-violet-400/20 bg-violet-500/10",
    button: "bg-violet-300 text-slate-950 hover:bg-violet-200",
    glow:
      "bg-[radial-gradient(circle_at_top_right,_rgba(139,92,246,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.12),transparent_35%)]",
  },
} as const;

type MarketPageSlug = Exclude<MarketSlug, "growth">;

function applyLock(companies: RankingCompany[], pro: boolean) {
  if (pro) return companies;
  return companies.map((company, index) =>
    index < FREE_VISIBLE_S_RANK_LIMIT ? company : { ...company, locked: true }
  );
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function loadMarketData(marketSlug: MarketPageSlug) {
  const [companies, masterResult] = await Promise.all([
    loadAllSupabaseRows<RankingCompany>(
      `${marketSlug}分析データ取得失敗`,
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, company_name, score, danger_score, risk_level, financials")
          .eq("market_segment", marketSlug)
          .neq("risk_level", "EXCLUDED")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker", { count: "exact", head: true })
      .eq("market_segment", marketSlug)
      .eq("listing_status", "listed"),
  ]);

  if (masterResult.error) {
    throw new Error(`${marketSlug}会社マスタ件数取得失敗: ${masterResult.error.message}`);
  }

  return {
    companies,
    listedCount: masterResult.count ?? 0,
  };
}

export default async function MarketBuildingPage({
  marketSlug,
}: {
  marketSlug: MarketPageSlug;
}) {
  const market = marketDefinitions[marketSlug];
  const tone = toneClasses[marketSlug];
  const [{ companies, listedCount }, pro] = await Promise.all([
    loadMarketData(marketSlug),
    isProUser(),
  ]);

  const scoreTop = applyLock(
    [...companies].sort((a, b) => numberValue(b.score) - numberValue(a.score)).slice(0, 5),
    pro
  );
  const revenueTop = applyLock(
    [...companies]
      .filter((company) => numberValue(company.financials?.revenue) > 0)
      .sort(
        (a, b) =>
          numberValue(b.financials?.revenue) - numberValue(a.financials?.revenue)
      )
      .slice(0, 5),
    pro
  );
  const operatingCFTop = applyLock(
    [...companies]
      .filter((company) => numberValue(company.financials?.operatingCF) !== 0)
      .sort(
        (a, b) =>
          numberValue(b.financials?.operatingCF) -
          numberValue(a.financials?.operatingCF)
      )
      .slice(0, 5),
    pro
  );
  const dangerTop = applyLock(
    [...companies]
      .sort((a, b) => numberValue(b.danger_score) - numberValue(a.danger_score))
      .slice(0, 5),
    pro
  );

  const searchCompanies = companies.map((company) => ({
    ticker: company.ticker,
    company_name: company.company_name,
    score: company.score,
    danger_score: company.danger_score,
  }));

  const analysisRate = listedCount > 0 ? Math.round((companies.length / listedCount) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className={`pointer-events-none absolute inset-0 ${tone.glow}`} />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-10">
          <p className={`text-xs font-black tracking-[0.3em] ${tone.eyebrow}`}>
            {market.englishName.toUpperCase()} FINANCIAL DASHBOARD
          </p>
          <h1 className="mt-4 text-4xl font-black sm:text-6xl">{market.name}の決算探偵</h1>
          <p className="mt-6 max-w-4xl text-base leading-8 text-slate-300 sm:text-lg">
            {market.description}
          </p>

          <div className="mt-7 max-w-3xl">
            <CompanySearch companies={searchCompanies} />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className={`rounded-2xl border p-5 ${tone.panel}`}>
              <p className={`text-sm font-bold ${tone.eyebrow}`}>上場対象銘柄</p>
              <p className="mt-2 text-4xl font-black">{listedCount}</p>
            </div>
            <div className="rounded-2xl border border-green-400/20 bg-green-500/10 p-5">
              <p className="text-sm font-bold text-green-300">解析済み銘柄</p>
              <p className="mt-2 text-4xl font-black">{companies.length}</p>
            </div>
            <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-5">
              <p className="text-sm font-bold text-yellow-300">解析進捗</p>
              <p className="mt-2 text-4xl font-black">{analysisRate}%</p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/${marketSlug}/ranking`}
              className={`rounded-2xl px-5 py-3 font-black transition ${tone.button}`}
            >
              {market.name}ランキングを見る →
            </Link>
            <Link
              href="/markets"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              市場を切り替える
            </Link>
          </div>
        </div>

        {companies.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-6 sm:p-8">
            <p className="text-xs font-black tracking-[0.25em] text-yellow-300">DATA IMPORTING</p>
            <h2 className="mt-3 text-2xl font-black">財務データを順次取り込み中です</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              市場マスタの登録は完了しています。EDINETから各社の最新有価証券報告書を解析すると、ランキングと会社ページへ自動反映されます。
            </p>
          </section>
        ) : (
          <section className="mt-8 grid gap-5 lg:grid-cols-2">
            <RankingCard
              title="総合スコア上位"
              description={`${market.name}向けの成長・収益品質・財務安全性モデルで評価しています。`}
              href={`/${marketSlug}/ranking?metric=score`}
              companies={scoreTop}
              metric="score"
            />
            <RankingCard
              title="売上高上位"
              description="取得済みの最新決算における売上高上位企業です。"
              href={`/${marketSlug}/ranking?metric=revenue`}
              companies={revenueTop}
              metric="revenue"
            />
            <RankingCard
              title="営業CF上位"
              description="本業から生み出したキャッシュが大きい企業です。"
              href={`/${marketSlug}/ranking?metric=operatingCF`}
              companies={operatingCFTop}
              metric="operatingCF"
            />
            <RankingCard
              title="Danger Score上位"
              description="開示・資金繰り・財務安全性の注意シグナルが多い企業です。"
              href={`/${marketSlug}/ranking?metric=danger`}
              companies={dangerTop}
              metric="danger"
            />
          </section>
        )}
      </section>
    </main>
  );
}
