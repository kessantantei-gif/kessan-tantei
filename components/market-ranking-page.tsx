import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { marketDefinitions, type MarketSlug } from "@/lib/markets";
import { isProUser, FREE_VISIBLE_S_RANK_LIMIT } from "@/lib/pro-engine";
import type { RankingCompany } from "@/components/RankingCard";

type MarketPageSlug = Exclude<MarketSlug, "growth">;
type Metric = "score" | "revenue" | "operatingIncome" | "operatingCF" | "danger";

const validMetrics = new Set<Metric>([
  "score",
  "revenue",
  "operatingIncome",
  "operatingCF",
  "danger",
]);

const metricLabels: Record<Metric, string> = {
  score: "総合スコア",
  revenue: "売上高",
  operatingIncome: "営業利益",
  operatingCF: "営業CF",
  danger: "Danger Score",
};

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

function displayValue(company: RankingCompany, metric: Metric, locked: boolean) {
  if (locked) return "＊＊";
  const value = valueOf(company, metric);
  if (metric === "score" || metric === "danger") return value.toFixed(1);
  return `${(value / 100_000_000).toFixed(1)}億円`;
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
  const pro = await isProUser();

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, risk_level, financials")
    .eq("market_segment", marketSlug)
    .neq("risk_level", "EXCLUDED")
    .limit(2500);

  if (error) throw new Error(`${market.name}ランキング取得失敗: ${error.message}`);

  const companies = ((data ?? []) as RankingCompany[])
    .filter((company) => metric === "score" || metric === "danger" || valueOf(company, metric) !== 0)
    .sort((a, b) => valueOf(b, metric) - valueOf(a, metric));

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <div>
            <p className="text-xs font-black tracking-[0.28em] text-slate-400">
              {market.englishName.toUpperCase()} RANKING
            </p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">
              {market.name} {metricLabels[metric]}ランキング
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              EDINETから取得・解析済みの企業を対象に、最新の保存値で順位付けしています。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(metricLabels) as Metric[]).map((item) => (
              <Link
                key={item}
                href={`/${marketSlug}/ranking?metric=${item}`}
                className={`rounded-full border px-4 py-2 text-xs font-black transition ${
                  metric === item
                    ? "border-white/30 bg-white/15 text-white"
                    : "border-white/10 bg-black/20 text-slate-400 hover:text-white"
                }`}
              >
                {metricLabels[item]}
              </Link>
            ))}
          </div>
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          {companies.length === 0 ? (
            <p className="p-8 text-center text-slate-400">
              この市場の解析済みデータはまだありません。
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {companies.map((company, index) => {
                const locked = !pro && index >= FREE_VISIBLE_S_RANK_LIMIT;
                const href = locked ? "/pricing" : `/company/${company.ticker}`;

                return (
                  <Link
                    key={company.ticker}
                    href={href}
                    className={`grid grid-cols-[50px_1fr_auto] items-center gap-3 p-4 transition hover:bg-white/10 sm:p-5 ${
                      locked ? "bg-yellow-500/5" : ""
                    }`}
                  >
                    <span className="text-center text-lg font-black text-slate-400">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`truncate font-black ${locked ? "text-yellow-300" : "text-white"}`}>
                        {locked ? "Pro限定ランキング銘柄" : company.company_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {locked ? "初月100円で4位以降を表示" : company.ticker}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-white">
                        {displayValue(company, metric, locked)}
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-slate-500">
                        {metricLabels[metric]}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
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
