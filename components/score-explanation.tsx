type Financials = {
  revenueGrowth?: number | null;
  grossProfitGrowth?: number | null;
  operatingMargin?: number | null;
  operatingCFMargin?: number | null;
  equityRatio?: number | null;
};

type RiskFlag = {
  title?: string;
  level?: string;
  scoreImpact?: number;
};

type Props = {
  score: number;
  scoreBreakdown: {
    growth?: number;
    quality?: number;
    safety?: number;
  };
  financials: Financials;
  riskFlags?: RiskFlag[];
};

function stars(value: number) {
  const count = Math.max(1, Math.min(5, Math.round(value / 20)));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

function pct(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "データなし";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function scoreTone(value: number) {
  if (value >= 80) return "text-green-200";
  if (value >= 60) return "text-cyan-200";
  if (value >= 40) return "text-yellow-200";
  return "text-red-200";
}

function reasonRows(financials: Financials, riskFlags: RiskFlag[]) {
  const rows: { sign: "+" | "−" | "±"; text: string; detail: string }[] = [];

  if (typeof financials.revenueGrowth === "number") {
    if (financials.revenueGrowth >= 30) {
      rows.push({ sign: "+", text: "売上成長率が高水準", detail: pct(financials.revenueGrowth) });
    } else if (financials.revenueGrowth >= 0) {
      rows.push({ sign: "±", text: "売上は増加傾向", detail: pct(financials.revenueGrowth) });
    } else {
      rows.push({ sign: "−", text: "売上が減少", detail: pct(financials.revenueGrowth) });
    }
  }

  if (typeof financials.grossProfitGrowth === "number") {
    if (financials.grossProfitGrowth >= 20) {
      rows.push({ sign: "+", text: "売上総利益が伸長", detail: pct(financials.grossProfitGrowth) });
    } else if (financials.grossProfitGrowth < 0) {
      rows.push({ sign: "−", text: "売上総利益が減少", detail: pct(financials.grossProfitGrowth) });
    }
  }

  if (typeof financials.operatingMargin === "number") {
    if (financials.operatingMargin >= 10) {
      rows.push({ sign: "+", text: "営業利益率が良好", detail: pct(financials.operatingMargin) });
    } else if (financials.operatingMargin >= 0) {
      rows.push({ sign: "±", text: "営業黒字を確保", detail: pct(financials.operatingMargin) });
    } else {
      rows.push({ sign: "−", text: "営業赤字", detail: pct(financials.operatingMargin) });
    }
  }

  if (typeof financials.operatingCFMargin === "number") {
    if (financials.operatingCFMargin > 0) {
      rows.push({ sign: "+", text: "営業CF率がプラス", detail: pct(financials.operatingCFMargin) });
    } else {
      rows.push({ sign: "−", text: "営業CF率がマイナス", detail: pct(financials.operatingCFMargin) });
    }
  }

  if (typeof financials.equityRatio === "number") {
    if (financials.equityRatio >= 50) {
      rows.push({ sign: "+", text: "自己資本比率が高め", detail: pct(financials.equityRatio) });
    } else if (financials.equityRatio < 20) {
      rows.push({ sign: "−", text: "自己資本比率に注意", detail: pct(financials.equityRatio) });
    }
  }

  for (const flag of riskFlags.slice(0, 3)) {
    rows.push({
      sign: "−",
      text: flag.title ?? "リスクシグナルあり",
      detail: flag.scoreImpact ? `影響 +${flag.scoreImpact}` : flag.level ?? "要確認",
    });
  }

  return rows.slice(0, 8);
}

export default function ScoreExplanation({ score, scoreBreakdown, financials, riskFlags = [] }: Props) {
  const growth = Math.min(100, Math.round(((scoreBreakdown.growth ?? 0) / 40) * 100));
  const quality = Math.min(100, Math.round(((scoreBreakdown.quality ?? 0) / 30) * 100));
  const safety = Math.min(100, Math.round(((scoreBreakdown.safety ?? 0) / 30) * 100));
  const rows = reasonRows(financials, riskFlags);

  return (
    <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.22em] text-slate-500">SCORE REASON</p>
          <h2 className="mt-2 text-lg font-black text-white">スコアの見える化</h2>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-right">
          <p className="text-[10px] font-bold text-cyan-200">総合</p>
          <p className="text-lg font-black text-cyan-100">{score}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <ScoreReasonBar label="成長性" value={growth} />
        <ScoreReasonBar label="収益・CF品質" value={quality} />
        <ScoreReasonBar label="安全性・リスク" value={safety} />
      </div>

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-400">
            スコア根拠を表示できる指標がまだ不足しています。
          </p>
        ) : (
          rows.map((row, index) => (
            <div key={`${row.text}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={
                    row.sign === "+"
                      ? "text-sm font-black text-green-300"
                      : row.sign === "−"
                        ? "text-sm font-black text-red-300"
                        : "text-sm font-black text-yellow-300"
                  }
                >
                  {row.sign}
                </span>
                <p className="truncate text-sm font-bold text-slate-200">{row.text}</p>
              </div>
              <p className="shrink-0 text-xs font-bold text-slate-400">{row.detail}</p>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        財務指標とリスクシグナルを機械的に整理した表示です。買い・売り等の投資判断を示すものではありません。
      </p>
    </div>
  );
}

function ScoreReasonBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-slate-300">{label}</span>
        <span className={`font-black ${scoreTone(value)}`}>{stars(value)} {value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-white/70" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
