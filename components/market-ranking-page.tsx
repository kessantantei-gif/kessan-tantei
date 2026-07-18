import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";
import { marketDefinitions, type MarketSlug } from "@/lib/markets";
import { isProUser, FREE_VISIBLE_S_RANK_LIMIT } from "@/lib/pro-engine";
import type { RankingCompany } from "@/components/RankingCard";

type MarketPageSlug = Exclude<MarketSlug, "growth">;
type Metric = "score" | "revenue" | "operatingIncome" | "operatingCF" | "danger";

const metricDefinitions: Record<Metric, { label: string; description: string }> = {
  score: {
    label: "総合スコア",
    description: "成長性・収益性・財務安全性を総合比較",
  },
  revenue: {
    label: "売上高",
    description: "最新決算の売上規模を比較",
  },
  operatingIncome: {
    label: "営業利益",
    description: "本業の利益額を比較",
  },
  operatingCF: {
    label: "営業CF",
    description: "本業から生み出す現金を比較",
  },
  danger: {
    label: "Danger Score",
    description: "財務・開示上の注意シグナルを比較",
  },
};

const validMetrics = new Set<Metric>(Object.keys(metricDefinitions) as Metric[]);

function metricFromValue(value?: string): Metric {
  return value && validMetrics.has(value as Metric) ? (value as Metric) : "score";
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function valueOf(company: RankingCompany, metric: Metric) {
  if (metric === "score") return numeric(company.score);
  if (metric === "danger") return numeric(company.danger_score);
  return numeric(company.financials?.[metric]);
}

function displayValue(company: RankingCompany, metric: Metric) {
  const value = valueOf(company, metric);
  if (metric === "score" || metric === "danger") return value.toFixed(1);
  return `${(value / 100_000_000).toFixed(1)}億円`;
}

async function loadCompanies(marketSlug: MarketPageSlug) {
  return loadAllSupabaseRows<RankingCompany>(
    `${marketSlug}ランキング取得失敗`,
    (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, score, danger_score, risk_level, financials")
        .eq("market_segment", marketSlug)
        .neq("risk_level", "EXCLUDED")
        .order("ticker", { ascending: true })
        .range(from, to)
  );
}

export default async function MarketRankingPage({
  marketSlug,
  metricValue,
}: {
  marketSlug: MarketPageSlug;
  metricValue?: string;
}) {
  const metric = metricFromValue(metricValue);
  const market = marketDefinitions[marketSlug];
  const [pro, loadedCompanies] = await Promise.all([
    isProUser(),
    loadCompanies(marketSlug),
  ]);

  const companies = loadedCompanies
    .filter((company) => metric === "score" || metric === "danger" || valueOf(company, metric) !== 0)
    .sort((a, b) => valueOf(b, metric) - valueOf(a, metric));

  const visibleCompanies = pro
    ? companies
    : companies.slice(0, FREE_VISIBLE_S_RANK_LIMIT);
  const lockedCount = Math.max(0, companies.length - visibleCompanies.length);
  const selectedMetric = metricDefinitions[metric];

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <p className="text-xs font-black tracking-[0.28em] text-slate-400">
            {market.englishName.toUpperCase()} RANKING
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">
            {market.name}のランキング
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            比較したい指標を選ぶと、その指標のランキングへ切り替わります。
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(metricDefinitions) as Metric[]).map((item) => {
              const definition = metricDefinitions[item];
              const selected = metric === item;

              return (
                <Link
                  key={item}
                  href={`/${marketSlug}/ranking?metric=${item}`}
                  className={`rounded-2xl border p-4 transition ${
                    selected
                      ? "border-cyan-300/60 bg-cyan-400/15 text-white ring-2 ring-cyan-300/20"
                      : "border-white/10 bg-black/20 text-slate-300 hover:border-white/25 hover:bg-white/10"
                  }`}
                >
                  <p className="font-black">{definition.label}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {definition.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-7">
          <h2 className="text-2xl font-black">
            {selectedMetric.label}ランキング
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            {selectedMetric.description}。対象企業数は{companies.length}社です。
            {!pro
              ? ` 無料では上位${Math.min(FREE_VISIBLE_S_RANK_LIMIT, companies.length)}社まで表示します。`
              : " Proでは全件表示しています。"}
          </p>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          {companies.length === 0 ? (
            <p className="p-8 text-center text-slate-400">
              この指標で表示できる解析済みデータはありません。
            </p>
          ) : (
            <>
              <div className="divide-y divide-white/10">
                {visibleCompanies.map((company, index) => (
                  <Link
                    key={company.ticker}
                    href={`/company/${company.ticker}`}
                    className="grid grid-cols-[50px_1fr_auto] items-center gap-3 p-4 transition hover:bg-white/10 sm:p-5"
                  >
                    <span className="text-center text-lg font-black text-slate-400">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-white">
                        {company.company_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {company.ticker}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-white">
                        {displayValue(company, metric)}
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-slate-500">
                        {selectedMetric.label}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {!pro && lockedCount > 0 ? (
                <div className="border-t border-yellow-300/20 bg-yellow-400/10 p-6 text-center sm:p-8">
                  <p className="text-xs font-black tracking-[0.25em] text-yellow-200">
                    PRO RANKING
                  </p>
                  <h2 className="mt-3 text-2xl font-black text-white">
                    残り{lockedCount}社の順位を見る
                  </h2>
                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                    Proでは4位以降の会社名・数値を含む全順位を確認できます。
                  </p>
                  <Link
                    href="/pricing"
                    className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-yellow-400 px-6 py-3 font-black text-slate-950 hover:bg-yellow-300"
                  >
                    Proで全順位を表示
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/${marketSlug}`}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            {market.name}トップへ戻る
          </Link>
          <Link
            href="/markets"
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            市場を切り替える
          </Link>
        </div>
      </section>
    </main>
  );
}
