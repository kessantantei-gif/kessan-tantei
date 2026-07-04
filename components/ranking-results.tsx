import Link from "next/link";
import MetricBadge from "@/components/MetricBadge";
import type { RankedCompany, RankingDefinition } from "@/lib/rankings/types";

type Props = {
  definition: RankingDefinition;
  rankings: RankedCompany[];
};

export default function RankingResults({ definition, rankings }: Props) {
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

  return (
    <ol className="space-y-4">
      {rankings.map(({ company, value, comment }, index) => (
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
    </ol>
  );
}
