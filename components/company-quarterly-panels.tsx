import {
  buildTrendPoints,
  findLatestComparablePeriod,
  metricValue,
  type AnnualFinancialRow,
  type QuarterlyFinancialRow,
} from "@/lib/quarterly-financials";

function yenOku(value: number | null) {
  if (value === null) return "未開示";
  return `${(value / 100000000).toFixed(2)} 億円`;
}

function changeLabel(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return "比較不可";
  if (previous < 0 && current > 0) return "赤字 → 黒字";
  if (previous > 0 && current < 0) return "黒字 → 赤字";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
      <h2 className="text-2xl font-black">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">{children}</div>
    </div>
  );
}

function TrendPanel({
  title,
  annualHistory,
  quarterlyHistory,
  metric,
}: {
  title: string;
  annualHistory: AnnualFinancialRow[];
  quarterlyHistory: QuarterlyFinancialRow[];
  metric: "revenue" | "operatingIncome" | "operatingCF";
}) {
  const points = buildTrendPoints({ annualHistory, quarterlyHistory, metric });
  const maximum = Math.max(1, ...points.map((point) => Math.abs(point.value ?? 0)));

  return (
    <Panel title={title}>
      <div className="space-y-3">
        {points.map((point) => (
          <div key={`${title}-${point.key}`}>
            <div className="mb-1 flex items-start justify-between gap-3 text-sm text-slate-400">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{point.label}</span>
                {point.periodKind === "quarterly" ? (
                  <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black text-cyan-200">
                    累計
                  </span>
                ) : null}
                {point.isLatest ? (
                  <span className="shrink-0 rounded-full bg-green-400 px-2 py-0.5 text-[10px] font-black text-slate-950">最新</span>
                ) : null}
              </span>
              <span className="shrink-0 font-bold text-slate-200">{yenOku(point.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-2 rounded-full ${point.periodKind === "quarterly" ? "bg-cyan-300/80" : "bg-green-400"}`}
                style={{ width: `${point.value === null ? 0 : Math.max(2, Math.min(100, (Math.abs(point.value) / maximum) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {quarterlyHistory.length > 0 ? (
        <p className="mt-4 text-xs leading-5 text-slate-500">
          四半期は会社開示の累計値です。営業CFなど未開示の項目は0ではなく「未開示」と表示します。
        </p>
      ) : null}
    </Panel>
  );
}

export function CompanyFinancialTrends({
  annualHistory,
  quarterlyHistory,
}: {
  annualHistory: AnnualFinancialRow[];
  quarterlyHistory: QuarterlyFinancialRow[];
}) {
  return (
    <div data-company-section="financial-trends" className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">
      <TrendPanel title="売上推移" annualHistory={annualHistory} quarterlyHistory={quarterlyHistory} metric="revenue" />
      <TrendPanel title="営業利益推移" annualHistory={annualHistory} quarterlyHistory={quarterlyHistory} metric="operatingIncome" />
      <TrendPanel title="営業CF推移" annualHistory={annualHistory} quarterlyHistory={quarterlyHistory} metric="operatingCF" />
    </div>
  );
}

function ChangeMetric({
  label,
  current,
  previous,
}: {
  label: string;
  current: number | null;
  previous: number | null;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black break-words">{changeLabel(current, previous)}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        最新: {yenOku(current)}
        <br />
        比較期: {yenOku(previous)}
      </p>
    </div>
  );
}

export function CompanyEarningsChange({
  annualHistory,
  quarterlyHistory,
  canShowProDetail,
  lockedContent,
}: {
  annualHistory: AnnualFinancialRow[];
  quarterlyHistory: QuarterlyFinancialRow[];
  canShowProDetail: boolean;
  lockedContent: React.ReactNode;
}) {
  const comparison = findLatestComparablePeriod({ annualHistory, quarterlyHistory });

  return (
    <div data-company-section="earnings" className="rounded-3xl border border-purple-400/20 bg-purple-500/10 p-4 backdrop-blur-xl sm:p-6">
      <p className="text-[11px] tracking-[0.24em] text-purple-300 sm:text-sm">EARNINGS CHANGE</p>
      <h2 className="mt-2 text-2xl font-black sm:text-3xl">決算変化速報</h2>
      {canShowProDetail ? (
        comparison ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-purple-300 px-3 py-1 text-slate-950">{comparison.periodLabel}</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-slate-300">{comparison.comparisonLabel}</span>
              {comparison.isQuarterly ? (
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-200">四半期累計ベース</span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ChangeMetric label="売上高" current={metricValue(comparison.current, "revenue")} previous={metricValue(comparison.previous, "revenue")} />
              <ChangeMetric label="営業利益" current={metricValue(comparison.current, "operatingIncome")} previous={metricValue(comparison.previous, "operatingIncome")} />
              <ChangeMetric label="営業CF" current={metricValue(comparison.current, "operatingCF")} previous={metricValue(comparison.previous, "operatingCF")} />
            </div>
          </>
        ) : (
          <p className="mt-4 text-slate-400">前年同期または前期と比較できる履歴データが不足しています。</p>
        )
      ) : (
        lockedContent
      )}
    </div>
  );
}
