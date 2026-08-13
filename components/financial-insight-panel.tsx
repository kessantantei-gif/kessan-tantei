import type {
  FinancialInsight,
  InsightTone,
  ProductMetric,
} from "@/lib/financial-insight-engine";

function toneClass(tone: InsightTone) {
  if (tone === "positive") return "border-green-400/20 bg-green-500/10 text-green-100";
  if (tone === "danger") return "border-red-400/25 bg-red-500/10 text-red-100";
  if (tone === "watch") return "border-yellow-400/20 bg-yellow-500/10 text-yellow-100";
  return "border-white/10 bg-black/20 text-slate-300";
}

function verdictClass(code: FinancialInsight["verdictCode"]) {
  if (code === "GOOD") return "border-green-400/30 bg-green-500/10 text-green-200";
  if (code === "HIGH_RISK") return "border-red-400/30 bg-red-500/10 text-red-200";
  if (code === "CAUTION") return "border-orange-400/30 bg-orange-500/10 text-orange-200";
  if (code === "WATCH") return "border-yellow-400/30 bg-yellow-500/10 text-yellow-200";
  return "border-cyan-400/20 bg-cyan-500/10 text-cyan-200";
}

export default function FinancialInsightPanel({
  insight,
  compact = false,
}: {
  insight: FinancialInsight;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${verdictClass(insight.verdictCode)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black tracking-[0.2em] opacity-75">FINANCIAL VERDICT</span>
          <span className="rounded-full border border-current/20 px-3 py-1 text-xs font-black">
            {insight.verdict}
          </span>
        </div>
        <p className="mt-3 text-xl font-black text-white">{insight.headline}</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-black tracking-[0.18em] text-cyan-200">KESSAN TANTEI METRICS</p>
            <h3 className="mt-1 text-base font-black text-white">決算探偵 固定4指標</h3>
          </div>
          <span className="text-[11px] font-bold text-slate-500">固定ルール / 開示データのみ</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {insight.productMetrics.map((metric) => (
            <ProductMetricCard key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <InsightList title="プラス材料" items={insight.positives} />
        <InsightList title="警戒材料" items={insight.watches} />
      </div>

      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-4">
        <p className="text-xs font-black tracking-[0.16em] text-cyan-200">NEXT CHECK</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-200">
          {insight.nextChecks.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-cyan-300">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {!compact ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-black tracking-[0.16em] text-slate-400">判定根拠</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {insight.evidence.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductMetricCard({ metric }: { metric: ProductMetric }) {
  return (
    <div className={`rounded-xl border p-3 ${toneClass(metric.tone)}`}>
      <p className="text-[11px] font-black tracking-[0.12em] opacity-70">{metric.label}</p>
      <p className="mt-1 text-lg font-black text-white">{metric.value}</p>
      <p className="mt-2 text-xs leading-5 opacity-80">{metric.detail}</p>
    </div>
  );
}

function InsightList({
  title,
  items,
}: {
  title: string;
  items: FinancialInsight["positives"];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black tracking-[0.16em] text-slate-400">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label} className={`rounded-xl border px-3 py-2 text-sm font-bold ${toneClass(item.tone)}`}>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
