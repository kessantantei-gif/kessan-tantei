import Link from "next/link";
import type { MarketSlug } from "@/lib/markets";
import { marketDefinitions } from "@/lib/markets";
import { supabaseAdmin } from "@/lib/supabase";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";
import { isProUser, FREE_VISIBLE_S_RANK_LIMIT } from "@/lib/pro-engine";
import RankingCard, { type RankingCompany } from "@/components/RankingCard";
import CompanySearch from "@/components/company-search";

type MarketPageSlug = Exclude<MarketSlug, "growth">;

type NewsItem = {
  id: string | number;
  ticker: string | null;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
};

type FocusGroup = {
  label: string;
  title: string;
  description: string;
  tone: "green" | "cyan" | "red";
  companies: RankingCompany[];
};

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

function applyLock(companies: RankingCompany[], pro: boolean) {
  if (pro) return companies;
  return companies.map((company, index) =>
    index < FREE_VISIBLE_S_RANK_LIMIT ? company : { ...company, locked: true }
  );
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metricValue(company: RankingCompany, key: string) {
  const value = company.financials?.[key as keyof typeof company.financials];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function focusToneClasses(tone: FocusGroup["tone"]) {
  if (tone === "green") return "border-green-400/20 bg-green-500/10 text-green-200";
  if (tone === "cyan") return "border-cyan-400/20 bg-cyan-500/10 text-cyan-200";
  return "border-red-400/20 bg-red-500/10 text-red-200";
}

function formatNewsDate(value?: string | null) {
  if (!value) return "日付不明";
  return new Date(value).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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

  const tickerSet = new Set(companies.map((company) => company.ticker));
  const { data: recentNews } = await supabaseAdmin
    .from("growth_news")
    .select("id, ticker, title, url, source, published_at")
    .not("url", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(300);

  const news = ((recentNews ?? []) as NewsItem[])
    .filter((item) => item.ticker && tickerSet.has(item.ticker))
    .slice(0, 3);

  return {
    companies,
    listedCount: masterResult.count ?? 0,
    news,
  };
}

export default async function MarketBuildingPage({
  marketSlug,
}: {
  marketSlug: MarketPageSlug;
}) {
  const market = marketDefinitions[marketSlug];
  const tone = toneClasses[marketSlug];
  const [{ companies, listedCount, news }, pro] = await Promise.all([
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
      .sort((a, b) => numberValue(b.financials?.revenue) - numberValue(a.financials?.revenue))
      .slice(0, 5),
    pro
  );
  const operatingIncomeTop = applyLock(
    [...companies]
      .filter((company) => numberValue(company.financials?.operatingIncome) !== 0)
      .sort(
        (a, b) =>
          numberValue(b.financials?.operatingIncome) -
          numberValue(a.financials?.operatingIncome)
      )
      .slice(0, 5),
    pro
  );
  const operatingCFTop = applyLock(
    [...companies]
      .filter((company) => numberValue(company.financials?.operatingCF) !== 0)
      .sort(
        (a, b) =>
          numberValue(b.financials?.operatingCF) - numberValue(a.financials?.operatingCF)
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

  const focusGroups: FocusGroup[] = [
    {
      label: "QUALITY GROWTH",
      title: "成長かつ営業黒字",
      description: "売上成長率がプラスで、営業利益率もプラスの企業です。",
      tone: "green",
      companies: [...companies]
        .filter(
          (company) =>
            (metricValue(company, "revenueGrowth") ?? -Infinity) > 0 &&
            (metricValue(company, "operatingMargin") ?? -Infinity) >= 0
        )
        .sort((a, b) => numberValue(b.score) - numberValue(a.score))
        .slice(0, 3),
    },
    {
      label: "CASH IMPROVEMENT",
      title: "営業CF改善",
      description: "営業CFが前期から改善している企業です。",
      tone: "cyan",
      companies: [...companies]
        .filter((company) => (metricValue(company, "operatingCFGrowth") ?? 0) > 0)
        .sort(
          (a, b) =>
            (metricValue(b, "operatingCFGrowth") ?? 0) -
            (metricValue(a, "operatingCFGrowth") ?? 0)
        )
        .slice(0, 3),
    },
    {
      label: "RISK WATCH",
      title: "リスク要確認",
      description: "Danger Scoreが高く、詳細項目を確認したい企業です。",
      tone: "red",
      companies: [...companies]
        .sort((a, b) => numberValue(b.danger_score) - numberValue(a.danger_score))
        .slice(0, 3),
    },
  ];

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
            {market.description} 成長・利益・営業CF・リスクをGrowthと同じ構成で確認できます。
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
              href="/markets#market-ranking"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              市場を切り替える
            </Link>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.28em] text-yellow-300">TODAY&apos;S FOCUS</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">今日見るべき企業</h2>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                成長・キャッシュ・リスクの3方向で自動抽出しています。
              </p>
            </div>
            <Link href={`/${marketSlug}/ranking`} className="text-sm font-bold text-yellow-200 hover:text-yellow-100">
              全ランキングを見る →
            </Link>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {focusGroups.map((group) => (
              <div key={group.label} className={`rounded-2xl border p-4 ${focusToneClasses(group.tone)}`}>
                <p className="text-[11px] font-black tracking-[0.22em]">{group.label}</p>
                <h3 className="mt-2 text-lg font-black text-white">{group.title}</h3>
                <p className="mt-2 text-xs leading-6 text-slate-400">{group.description}</p>
                <div className="mt-4 space-y-2">
                  {group.companies.map((company, index) => (
                    <Link
                      key={company.ticker}
                      href={`/company/${company.ticker}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm transition hover:bg-white/10"
                    >
                      <span className="min-w-0 truncate font-bold text-white">
                        {index + 1}. {company.company_name}
                      </span>
                      <span className="shrink-0 text-xs font-black text-slate-300">
                        {group.tone === "red" ? company.danger_score : company.score}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

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
            title="営業利益上位"
            description="取得済みの最新決算における営業利益上位企業です。"
            href={`/${marketSlug}/ranking?metric=operatingIncome`}
            companies={operatingIncomeTop}
            metric="operatingIncome"
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

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={`text-xs font-black tracking-[0.28em] ${tone.eyebrow}`}>LATEST NEWS</p>
              <h2 className="mt-2 text-2xl font-black">{market.name}の最新ニュース</h2>
            </div>
            <Link href={`/news?market=${marketSlug}`} className="text-sm font-bold text-slate-300 hover:text-white">
              もっと見る →
            </Link>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {news.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-slate-400 lg:col-span-3">
                最新ニュースを確認中です。
              </p>
            ) : (
              news.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-white/10"
                >
                  <p className="text-xs text-slate-500">{formatNewsDate(item.published_at)}</p>
                  <p className="mt-2 font-black leading-7 text-white">{item.title}</p>
                  <p className="mt-3 text-xs text-slate-500">{item.source || "Google News"}</p>
                </a>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
