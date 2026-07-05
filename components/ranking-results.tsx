import Link from "next/link";
import MetricBadge from "@/components/MetricBadge";
import type { RankedCompany, RankingDefinition } from "@/lib/rankings/types";

const FREE_VISIBLE_RANKING_LIMIT = 3;

type Props = {
  definition: RankingDefinition;
  rankings: RankedCompany[];
  isPro?: boolean;
};

function LockedRankingRow({ index }: { index: number }) {
  return (
    <li>
      <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 opacity-90 sm:p-5 lg:grid-cols-[72px_minmax(180px,1fr)_180px_minmax(220px,1.2fr)_24px] lg:items-center">
        <div className="flex items-center gap-3 lg:block">
          <span className="text-xs font-bold text-slate-500 lg:hidden">順位</span>
          <span className="text-3xl font-black text-slate-500">#{index + 1}</span>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="h-5 w-36 rounded-full bg-white/15 blur-[1px]" />
          <div className="h-3 w-24 rounded-full bg-white/10 blur-[1px]" />
        </div>

        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-center text-xs font-black text-yellow-200">
          🔒 Pro限定
        </div>

        <div className="space-y-2">
          <div className="h-3 w-full rounded-full bg-white/10 blur-[1px]" />
          <div className="h-3 w-3/4 rounded-full bg-white/10 blur-[1px]" />
        </div>

        <span className="hidden text-yellow-300 lg:block" aria-hidden="true">🔒</span>
      </div>
    </li>
  );
}

function RankingUpgradeCard({ lockedCount }: { lockedCount: number }) {
  if (lockedCount <= 0) return null;

  return (
    <div className="mt-6 rounded-3xl border border-yellow-300/30 bg-yellow-400/10 p-6 text-center shadow-2xl shadow-yellow-950/20 sm:p-8">
      <p className="text-xs font-black tracking-[0.28em] text-yellow-200">PRO RANKING</p>
      <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
        残り{lockedCount}社を見る
      </h2>
      <p className="mt-3 leading-7 text-slate-300">
        決算探偵Proなら、全順位・詳細コメント・関連ランキング・財務分析・リスク分析をまとめて確認できます。
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm font-bold text-yellow-100">
        <span className="rounded-full bg-white/10 px-3 py-1">全順位</span>
        <span className="rounded-full bg-white/10 px-3 py-1">詳細コメント</span>
        <span className="rounded-full bg-white/10 px-3 py-1">財務分析</span>
        <span className="rounded-full bg-white/10 px-3 py-1">リスク分析</span>
      </div>
      <Link
        href="/pricing"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-yellow-400 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-300 active:scale-95"
      >
        初月100円でProを始める
      </Link>
    </div>
  );
}

export default function RankingResults({ definition, rankings, isPro = false }: Props) {
  if (rankings.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
        <p className="text-lg font-bold text-white">現在、表示できる企業がありません</p>
        <p className="mt-2 text-sm leading-7">
          必要な決算データが取得でき次第、自動的にランキングへ反映されます。
        </p>
      </div>
    );
  }

  const visibleRankings = isPro ? rankings : rankings.slice(0, FREE_VISIBLE_RANKING_LIMIT);
  const lockedRankings = isPro ? [] : rankings.slice(FREE_VISIBLE_RANKING_LIMIT);

  return (
    <div>
      {!isPro ? (
        <div className="mb-5 rounded-2xl border border-green-400/20 bg-green-500/10 px-5 py-4 text-sm leading-7 text-slate-300">
          <strong className="text-green-200">TOP3無料。</strong>
          4位以降の会社名・数値・コメントはPro限定です。
        </div>
      ) : null}

      <ol className="space-y-4">
        {visibleRankings.map(({ company, value, comment }, index) => (
          <li key={company.ticker}>
            <Link
              href={`/company/${company.ticker}`}
              className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-green-400/40 hover:bg-white/10 sm:p-5 lg:grid-cols-[72px_minmax(180px,1fr)_180px_minmax(220px,1.2fr)_24px] lg:items-center"
            >
              <div className="flex items-center gap-3 lg:block">
                <span className="text-xs font-bold text-slate-500 lg:hidden">順位</span>
                <span className="text-3xl font-black text-slate-400">#{index + 1}</span>
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
              <span className="hidden text-green-300 lg:block" aria-hidden="true">→</span>
            </Link>
          </li>
        ))}

        {lockedRankings.slice(0, 6).map((_item, index) => (
          <LockedRankingRow key={`locked-${index}`} index={index + FREE_VISIBLE_RANKING_LIMIT} />
        ))}
      </ol>

      <RankingUpgradeCard lockedCount={lockedRankings.length} />
    </div>
  );
}
