import Link from "next/link";
import MetricBadge from "@/components/MetricBadge";
import CompareButton from "@/components/compare-button";
import type { RankedCompany, RankingDefinition, RankingCompany } from "@/lib/rankings/types";

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

function historyYear(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const item = row as { fiscalYear?: string | number; year?: string | number };
  const value = Number(item.fiscalYear ?? item.year);
  return Number.isFinite(value) ? value : null;
}

function hasFiscalGap(company: RankingCompany) {
  const years = (company.history ?? [])
    .map(historyYear)
    .filter((year): year is number => year !== null)
    .sort((a, b) => a - b);

  if (years.length < 2) return false;

  for (let i = 1; i < years.length; i += 1) {
    if (years[i] - years[i - 1] > 1) return true;
  }

  return false;
}

function EmptyRankingState({ definition }: { definition: RankingDefinition }) {
  const requiresComparison = COMPARISON_REQUIRED_SLUGS.has(definition.slug);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
      <p className="text-lg font-bold text-white">対象データなし</p>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7">
        {requiresComparison
          ? "前期比較に必要な2期分以上の決算データがある企業のみ表示します。"
          : "必要な決算データの取得後に自動反映します。"}
      </p>
      {requiresComparison ? (
        <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-sm leading-7 text-yellow-100">
          比較条件：2期分以上の連続データ
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
          残り{lockedCount}社の順位を表示
        </h2>
        <p className="mx-auto mt-4 max-w-2xl leading-8 text-slate-300">
          Proでは4位以降の会社名・指標値・判定根拠と、企業ページの詳細指標を表示します。
        </p>

        <div className="mx-auto mt-6 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
          {[
            "全順位と指標値",
            "Financial / Danger Score",
            "警戒シグナル内訳",
            "決算探偵 固定4指標",
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
          Proの表示範囲を確認
        </Link>
        <p className="mt-3 text-xs leading-6 text-slate-500">
          本サービスは投資助言ではありません。取得済み開示データの比較ツールです。
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
  const requiresComparison = COMPARISON_REQUIRED_SLUGS.has(definition.slug);

  return (
    <div>
      {!isPro ? (
        <div className="mb-5 rounded-3xl border border-green-400/25 bg-green-500/10 p-5 text-sm leading-7 text-slate-300 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <strong className="text-green-200">TOP3無料。</strong>
            4位以降の会社名・指標値・判定根拠はPro限定です。
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
        {visibleRankings.map(({ company, value }, index) => {
          const showFiscalGapNotice = requiresComparison && hasFiscalGap(company);
          const metricValue = definition.formatValue(value);

          return (
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
                    {showFiscalGapNotice ? (
                      <p className="mt-2 inline-flex rounded-full border border-yellow-300/25 bg-yellow-400/10 px-3 py-1 text-[11px] font-bold text-yellow-100">
                        比較年度に飛びあり
                      </p>
                    ) : null}
                  </div>

                  <MetricBadge
                    label={definition.metricLabel}
                    value={metricValue}
                    tone={definition.metricTone}
                  />

                  <div className="text-sm leading-6 text-slate-300">
                    <p className="text-[11px] font-black tracking-[0.14em] text-slate-500">RANKING EVIDENCE</p>
                    <p className="mt-1 font-black text-white">
                      {definition.metricLabel} {metricValue}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      Financial {company.score} / Danger {company.danger_score}
                    </p>
                    {showFiscalGapNotice ? (
                      <p className="mt-2 text-xs leading-5 text-yellow-100/90">
                        比較年度が非連続。会社ページの財務推移を要確認。
                      </p>
                    ) : null}
                  </div>
                </Link>

                <div className="flex justify-start lg:justify-end">
                  <CompareButton ticker={company.ticker} name={company.company_name} />
                </div>
              </div>
            </li>
          );
        })}

        {lockedRankings.slice(0, LOCKED_PREVIEW_LIMIT).map((_item, index) => (
          <LockedRankingRow key={`locked-${index}`} index={index + FREE_VISIBLE_RANKING_LIMIT} />
        ))}
      </ol>

      <RankingUpgradeCard lockedCount={lockedRankings.length} />
    </div>
  );
}
