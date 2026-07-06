type Financials = {
  revenueGrowth?: number | null;
  grossProfitGrowth?: number | null;
  operatingMargin?: number | null;
  operatingCFMargin?: number | null;
  ocfMargin?: number | null;
  equityRatio?: number | null;
  cashRatio?: number | null;
  grossMargin?: number | null;
  netMargin?: number | null;
};

type RiskFlag = {
  title?: string;
  description?: string;
  level?: string;
  scoreImpact?: number;
};

type Props = {
  score: number;
  scoreBreakdown: {
    growth?: number;
    quality?: number;
    safety?: number;
    riskPenalty?: number;
    [key: string]: number | undefined;
  };
  financials: Financials;
  riskFlags?: RiskFlag[];
};

type ScoreItem = {
  label: string;
  current: number;
  max: number;
  detail: string;
  basis: string;
  tone: "green" | "cyan" | "yellow" | "red" | "slate";
};

function pct(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "データなし";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toneByRate(rate: number): ScoreItem["tone"] {
  if (rate >= 0.75) return "green";
  if (rate >= 0.5) return "cyan";
  if (rate >= 0.25) return "yellow";
  return "red";
}

function toneClass(tone: ScoreItem["tone"]) {
  return {
    green: "border-green-300/20 bg-green-500/10 text-green-100",
    cyan: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100",
    yellow: "border-yellow-300/20 bg-yellow-500/10 text-yellow-100",
    red: "border-red-300/20 bg-red-500/10 text-red-100",
    slate: "border-white/10 bg-white/5 text-slate-100",
  }[tone];
}

function indicatorTone(tone: ScoreItem["tone"]) {
  return {
    green: "bg-green-300",
    cyan: "bg-cyan-300",
    yellow: "bg-yellow-300",
    red: "bg-red-300",
    slate: "bg-slate-300",
  }[tone];
}

function fallbackGrowthScore(financials: Financials) {
  const revenueGrowth = safeNumber(financials.revenueGrowth, 0);
  const grossProfitGrowth = safeNumber(financials.grossProfitGrowth, 0);
  let score = 0;
  if (revenueGrowth >= 50) score += 22;
  else if (revenueGrowth >= 30) score += 18;
  else if (revenueGrowth >= 10) score += 12;
  else if (revenueGrowth >= 0) score += 6;

  if (grossProfitGrowth >= 30) score += 18;
  else if (grossProfitGrowth >= 15) score += 12;
  else if (grossProfitGrowth >= 0) score += 6;

  return clamp(score, 0, 40);
}

function fallbackQualityScore(financials: Financials) {
  const operatingMargin = safeNumber(financials.operatingMargin, -999);
  const operatingCFMargin = safeNumber(financials.operatingCFMargin ?? financials.ocfMargin, -999);
  let score = 0;
  if (operatingMargin >= 15) score += 15;
  else if (operatingMargin >= 5) score += 10;
  else if (operatingMargin >= 0) score += 5;

  if (operatingCFMargin >= 15) score += 15;
  else if (operatingCFMargin >= 5) score += 10;
  else if (operatingCFMargin >= 0) score += 5;

  return clamp(score, 0, 30);
}

function fallbackSafetyScore(financials: Financials) {
  const equityRatio = safeNumber(financials.equityRatio, 0);
  const cashRatio = safeNumber(financials.cashRatio, 0);
  let score = 0;
  if (equityRatio >= 60) score += 18;
  else if (equityRatio >= 40) score += 14;
  else if (equityRatio >= 20) score += 8;
  else score += 3;

  if (cashRatio >= 100) score += 12;
  else if (cashRatio >= 50) score += 8;
  else if (cashRatio > 0) score += 4;

  return clamp(score, 0, 30);
}

function riskPenalty(riskFlags: RiskFlag[], scoreBreakdown: Props["scoreBreakdown"]) {
  const explicit = scoreBreakdown.riskPenalty;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return Math.abs(explicit);

  return clamp(
    riskFlags.reduce((sum, flag) => {
      if (typeof flag.scoreImpact === "number") return sum + Math.abs(flag.scoreImpact);
      if (flag.level === "critical") return sum + 15;
      if (flag.level === "high") return sum + 10;
      if (flag.level === "medium") return sum + 5;
      return sum + 3;
    }, 0),
    0,
    30
  );
}

function buildScoreItems(financials: Financials, scoreBreakdown: Props["scoreBreakdown"], riskFlags: RiskFlag[]) {
  const growth = clamp(safeNumber(scoreBreakdown.growth, fallbackGrowthScore(financials)), 0, 40);
  const quality = clamp(safeNumber(scoreBreakdown.quality, fallbackQualityScore(financials)), 0, 30);
  const safety = clamp(safeNumber(scoreBreakdown.safety, fallbackSafetyScore(financials)), 0, 30);
  const penalty = riskPenalty(riskFlags, scoreBreakdown);

  const items: ScoreItem[] = [
    {
      label: "成長性",
      current: growth,
      max: 40,
      detail: `売上成長率 ${pct(financials.revenueGrowth)} / 売上総利益成長率 ${pct(financials.grossProfitGrowth)}`,
      basis: "売上と粗利の伸びを重視します。高成長でも粗利が伸びない場合は評価を抑えます。",
      tone: toneByRate(growth / 40),
    },
    {
      label: "収益・CF品質",
      current: quality,
      max: 30,
      detail: `営業利益率 ${pct(financials.operatingMargin)} / 営業CF率 ${pct(financials.operatingCFMargin ?? financials.ocfMargin)}`,
      basis: "営業利益と営業CFの両方を見て、利益が現金を伴っているか確認します。",
      tone: toneByRate(quality / 30),
    },
    {
      label: "財務安全性",
      current: safety,
      max: 30,
      detail: `自己資本比率 ${pct(financials.equityRatio)} / 現預金余力 ${pct(financials.cashRatio)}`,
      basis: "自己資本比率と短期的な資金余力から、資金繰り耐性を確認します。",
      tone: toneByRate(safety / 30),
    },
    {
      label: "リスク控除",
      current: -penalty,
      max: 0,
      detail: riskFlags.length > 0 ? `${riskFlags.length}件のリスクシグナルを検出` : "重大なリスクシグナルは限定的",
      basis: "継続企業注記、希薄化、監査法人変更などの注意項目を控除要因として扱います。",
      tone: penalty >= 15 ? "red" : penalty >= 5 ? "yellow" : "green",
    },
  ];

  return items;
}

function reasonRows(financials: Financials, riskFlags: RiskFlag[]) {
  const rows: { sign: "+" | "−" | "±"; text: string; detail: string }[] = [];

  if (typeof financials.revenueGrowth === "number") {
    if (financials.revenueGrowth >= 30) rows.push({ sign: "+", text: "売上成長率が高水準", detail: pct(financials.revenueGrowth) });
    else if (financials.revenueGrowth >= 0) rows.push({ sign: "±", text: "売上は増加傾向", detail: pct(financials.revenueGrowth) });
    else rows.push({ sign: "−", text: "売上が減少", detail: pct(financials.revenueGrowth) });
  }

  if (typeof financials.operatingMargin === "number") {
    if (financials.operatingMargin >= 10) rows.push({ sign: "+", text: "営業利益率が良好", detail: pct(financials.operatingMargin) });
    else if (financials.operatingMargin >= 0) rows.push({ sign: "±", text: "営業黒字を確保", detail: pct(financials.operatingMargin) });
    else rows.push({ sign: "−", text: "営業赤字", detail: pct(financials.operatingMargin) });
  }

  if (typeof (financials.operatingCFMargin ?? financials.ocfMargin) === "number") {
    const value = financials.operatingCFMargin ?? financials.ocfMargin;
    if ((value ?? 0) > 0) rows.push({ sign: "+", text: "営業CF率がプラス", detail: pct(value) });
    else rows.push({ sign: "−", text: "営業CF率がマイナス", detail: pct(value) });
  }

  if (typeof financials.equityRatio === "number") {
    if (financials.equityRatio >= 50) rows.push({ sign: "+", text: "自己資本比率が高め", detail: pct(financials.equityRatio) });
    else if (financials.equityRatio < 20) rows.push({ sign: "−", text: "自己資本比率に注意", detail: pct(financials.equityRatio) });
  }

  for (const flag of riskFlags.slice(0, 5)) {
    rows.push({
      sign: "−",
      text: flag.title ?? flag.description ?? "リスクシグナルあり",
      detail: flag.scoreImpact ? `影響 ${flag.scoreImpact}` : flag.level ?? "要確認",
    });
  }

  return rows.slice(0, 10);
}

export default function ScoreExplanation({ score, scoreBreakdown, financials, riskFlags = [] }: Props) {
  const items = buildScoreItems(financials, scoreBreakdown, riskFlags);
  const rows = reasonRows(financials, riskFlags);
  const subtotal = items.slice(0, 3).reduce((sum, item) => sum + item.current, 0);
  const penalty = Math.abs(items[3]?.current ?? 0);

  return (
    <div className="mt-6 w-full rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.22em] text-slate-500">SCORE REASON</p>
          <h2 className="mt-2 text-2xl font-black text-white">スコア根拠</h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            総合スコアを、加点項目とリスク控除に分解して表示します。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:w-[320px]">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-3">
            <p className="text-[10px] font-bold text-cyan-200">総合</p>
            <p className="text-xl font-black text-cyan-100">{score}</p>
          </div>
          <div className="rounded-2xl border border-green-300/20 bg-green-500/10 px-3 py-3">
            <p className="text-[10px] font-bold text-green-200">加点</p>
            <p className="text-xl font-black text-green-100">{subtotal}</p>
          </div>
          <div className="rounded-2xl border border-yellow-300/20 bg-yellow-500/10 px-3 py-3">
            <p className="text-[10px] font-bold text-yellow-200">控除</p>
            <p className="text-xl font-black text-yellow-100">-{penalty}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {items.map((item) => (
          <ScoreItemCard key={item.label} item={item} />
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-black text-white">主な判定根拠</p>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {rows.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
              スコア根拠を表示できる指標がまだ不足しています。
            </p>
          ) : (
            rows.map((row, index) => (
              <div key={`${row.text}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={row.sign === "+" ? "text-sm font-black text-green-300" : row.sign === "−" ? "text-sm font-black text-red-300" : "text-sm font-black text-yellow-300"}>
                    {row.sign}
                  </span>
                  <p className="truncate text-sm font-bold text-slate-200">{row.text}</p>
                </div>
                <p className="shrink-0 text-xs font-bold text-slate-400">{row.detail}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        財務指標とリスクシグナルを機械的に整理した表示です。個別銘柄の売買判断を示すものではありません。
      </p>
    </div>
  );
}

function ScoreItemCard({ item }: { item: ScoreItem }) {
  const isPenalty = item.max === 0;
  const width = isPenalty ? clamp(Math.abs(item.current) / 30 * 100, 4, 100) : clamp(item.current / item.max * 100, 4, 100);

  return (
    <div className={`rounded-2xl border p-4 ${toneClass(item.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">{item.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{item.detail}</p>
        </div>
        <p className="shrink-0 text-lg font-black">
          {isPenalty ? item.current : `${item.current}/${item.max}`}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
        <div className={`h-full rounded-full ${indicatorTone(item.tone)}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-300">{item.basis}</p>
    </div>
  );
}
