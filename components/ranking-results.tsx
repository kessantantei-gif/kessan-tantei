import Link from "next/link";
import MetricBadge from "@/components/MetricBadge";
import CompareButton from "@/components/compare-button";
import type { RankedCompany, RankingDefinition } from "@/lib/rankings/types";

const FREE_VISIBLE_RANKING_LIMIT = 3;
const LOCKED_PREVIEW_LIMIT = 6;

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

type Props = {
  definition: RankingDefinition;
  rankings: RankedCompany[];
  isPro?: boolean;
};

function rankIcon(index: number) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `#${index + 1}`;
}

function EmptyRankingState({ definition }: { definition: RankingDefinition }) {
  const requiresComparison = COMPARISON_REQUIRED_SLUGS.has(definition.slug);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
      <p className="text-lg font-bold text-white">
        現在、表示できる企業がありません
      </p>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7">
        {requiresComparison
          ? "このランキングは前期との比較が必要なため、2期分以上の決算データが取得できた企業のみを表示します。1年分しかない企業は、成長率が正しく計算できないため除外しています。"
          : "必要な決算データが取得でき次第、自動的にランキングへ反映されます。"}
      </p>
      {requiresComparison ? (
        <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-sm leading-7 text-yellow-100">
          売上成長率・利益成長率・営業CF成長率などは、単年度データだけでは正しく比較できません。
        </div>
      ) : null}
    </div>
  );
}

function LockedRankingRow({ index }: { index: number }) {
  return (
    <li>
      <div className="relative overflow-hidden rounded-2xl border border-yellow-300/15 bg-white/[0.04] p-4 opacity-95 sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(250,204,21,0.08),transparent)]" />
        <div className="relative grid gap-4 lg:grid-cols-[72px_minmax(180px,1fr)_180px_minmax(220px,1.2fr)_24px] lg:items-center">
          <div className="flex items-center gap-3 lg:block">
            <span className="text-xs font-bold text-slate-500 lg:hidden">順位</span>
            <span className="text-3xl font-black text-yellow-200/80">#{index + 1}</span>
          </div>

          <div className="min-w-0 space-y-2" aria-hidden="true">
            <div className="h-5 w-40 rounded-full bg-white/15 blur-[1px]" />
            <div className="h-3 w-28 rounded-full bg-white/10 blur-[1px]" />
          </div>

          <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/10 px-4 py-3 text-center text-xs font-black text-yellow-100 shadow-inner shadow-yellow-950/20">
            🔒 Pro限定
          </div>

          <div className="space-y-2" aria-hidden="true">
            <div className="h-3 w-full rounded-full bg-white/10 blur-[1px]" />
            <div className="h-3 w-4/5 rounded-full bg-white/10 blur-[1px]" />
            <div className="h-3 w-2/3 rounded-full bg-white/10 blur-[1px]" />
          </div>

          <span className="hidden text-yellow-300 lg:block" aria-hidden="true">🔒</span>
        </div>
      </div>
    </li>
  );
}

function RankingUpgradeCard({ lockedCount }: { lockedCount: number }) {
  if (lockedCount <= 0) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-yellow-300/35 bg-gradient-to-br from-yellow-400/18 via-yellow-400/10 to-white/[0.03] p-[1px] shadow-2xl shadow-yellow-950/20">
      <div className="rounded-3xl bg-[#080b14]/90 p-6 text-center sm:p-8">
        <p className="text-xs font-black tracking-[0.28em] text-yellow-200">PRO RANKING</p>
        <h2 className="mt-3 text-2xl font-black text-white sm:text-4xl">
          残り{lockedCount}社の順位を見る
        </h2>
        <p className="mx-auto mt-4 max-w-2xl leading-8 text-slate-300">
          4位以降の会社名・数値・コメントはPro限定です。決算探偵Proなら、全順位を見ながら企業ページの財務分析・リスク分析まで一気に確認できます。
        </p>

        <div className="mx-auto mt-6 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
          {[
            "全順位と全社コメント",
            "企業ページの詳細財務分析",
            "リスクシグナルの内訳",
            "関連ランキングからの深掘り",
          ].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-yellow-50">
              ✓ {item}
            </div>
          ))}
        </div>

        <Link
          href="/pricing"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-yellow-400 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-300 active:scale-95 sm:w-auto sm:text-base"
        >
          初月100円で続きを見る
        </Link>
        <p className="mt-3 text-xs leading-6 text-slate-500">
          本サービスは投資助言ではありません。決算情報の理解を補助する分析ツールです。
        </p>
      </div>
    </div>
  );
}

export default function RankingResults({ definition, rankings, isPro = false }: Props) {
  if (rankings.length === 0) {
    return <EmptyRankingState definition={definition} />;
  }

  const visibleRankings = isPro ? rankings : rankings.slice(0, FREE_VISIBLE_RANKING_LIMIT);
  const lockedRankings = isPro ? [] : rankings.slice(FREE_VISIBLE_RANKING_LIMIT);

  return (
    <div>
      {!isPro ? (
        <div className="mb-5 rounded-3xl border border-green-400/25 bg-green-500/10 p-5 text-sm leading-7 text-slate-300 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <strong className="text-green-200">TOP3無料。</strong>
            4位以降の会社名・数値・コメントはPro限定です。
          </div>
          <Link
            href="/pricing"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-green-300/40 px-4 py-2 text-xs font-black text-green-100 transition hover:bg-green-400/10 active:scale-95 sm:mt-0"
          >
            Proを見る
          </Link>
        </div>
      ) : null}

      <ol className="space-y-4">
        {visibleRankings.map(({ company, value, comment }, index) => (
          <li key={company.ticker}>
            <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-green-400/40 hover:bg-white/10 sm:p-5 lg:grid-cols-[72px_minmax(180px,1fr)_180px_minmax(220px,1.2fr)_150px] lg:items-center">
              <Link href={`/company/${company.ticker}`} className="contents">
                <div className="flex items-center gap-3 lg:block">
                  <span className="text-xs font-bold text-slate-500 lg:hidden">順位</span>
                  <span className="text-3xl font-black text-slate-300">{rankIcon(index)}</span>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-lg font-black sm:text-xl">{company.company_name}</p>
                  <p className="mt-1 text-sm text-slate-500">証券コード {company.ticker}</p>
                </div>

                <MetricBadge
                  label={definition.metricLabel}
                  value={definition.formatValue(value)}
                  tone={definition.metricTone}
                />

                <p className="text-sm leading-6 text-slate-300">{comment}</p>
              </Link>

              <div className="flex justify-start lg:justify-end">
                <CompareButton ticker={company.ticker} name={company.company_name} />
              </div>
            </div>
          </li>
        ))}

        {lockedRankings.slice(0, LOCKED_PREVIEW_LIMIT).map((_item, index) => (
          <LockedRankingRow key={`locked-${index}`} index={index + FREE_VISIBLE_RANKING_LIMIT} />
        ))}
      </ol>

      <RankingUpgradeCard lockedCount={lockedRankings.length} />
    </div>
  );
}
