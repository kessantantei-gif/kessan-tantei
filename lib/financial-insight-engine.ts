export type InsightTone = "positive" | "watch" | "danger" | "neutral";

export type FinancialInsightPoint = {
  label: string;
  tone: InsightTone;
};

export type FinancialInsight = {
  verdict: "良好" | "標準" | "要確認" | "警戒" | "高リスク";
  verdictCode: "GOOD" | "NEUTRAL" | "WATCH" | "CAUTION" | "HIGH_RISK";
  headline: string;
  positives: FinancialInsightPoint[];
  watches: FinancialInsightPoint[];
  nextChecks: string[];
  evidence: string[];
};

type FinancialInsightInput = {
  score: number;
  dangerScore: number;
  riskLevel: string;
  revenue?: number | null;
  revenueGrowth?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  operatingCF?: number | null;
  operatingCFMargin?: number | null;
  equityRatio?: number | null;
  flags?: { title: string; scoreImpact?: number | null }[];
};

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function oku(value: number) {
  const amount = value / 100_000_000;
  return `${amount >= 0 ? "+" : ""}${amount.toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })}億円`;
}

function unique<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function verdictFor(input: FinancialInsightInput): Pick<FinancialInsight, "verdict" | "verdictCode"> {
  if (input.riskLevel === "REJECT" || input.dangerScore >= 80) {
    return { verdict: "高リスク", verdictCode: "HIGH_RISK" };
  }
  if (input.riskLevel === "DANGEROUS" || input.dangerScore >= 60 || input.score < 40) {
    return { verdict: "警戒", verdictCode: "CAUTION" };
  }
  if (input.riskLevel === "WARNING" || input.riskLevel === "WATCH" || input.dangerScore >= 40 || input.score < 60) {
    return { verdict: "要確認", verdictCode: "WATCH" };
  }
  if (input.score >= 80 && input.dangerScore < 30) {
    return { verdict: "良好", verdictCode: "GOOD" };
  }
  return { verdict: "標準", verdictCode: "NEUTRAL" };
}

function headlineFor(operatingIncome: number | null, operatingCF: number | null) {
  if (operatingIncome !== null && operatingCF !== null) {
    if (operatingIncome > 0 && operatingCF > 0) return "営業黒字・営業CFプラス";
    if (operatingIncome > 0 && operatingCF <= 0) return "営業黒字、営業CFはマイナス";
    if (operatingIncome <= 0 && operatingCF > 0) return "営業赤字、営業CFはプラス";
    return "営業赤字・営業CFマイナス";
  }
  if (operatingIncome !== null) return operatingIncome > 0 ? "営業黒字" : "営業赤字";
  if (operatingCF !== null) return operatingCF > 0 ? "営業CFプラス" : "営業CFマイナス";
  return "主要財務指標を確認";
}

export function generateFinancialInsight(input: FinancialInsightInput): FinancialInsight {
  const revenueGrowth = finite(input.revenueGrowth);
  const operatingIncome = finite(input.operatingIncome);
  const operatingMargin = finite(input.operatingMargin);
  const operatingCF = finite(input.operatingCF);
  const operatingCFMargin = finite(input.operatingCFMargin);
  const equityRatio = finite(input.equityRatio);
  const flags = input.flags ?? [];

  const positives: FinancialInsightPoint[] = [];
  const watches: FinancialInsightPoint[] = [];
  const nextChecks: string[] = [];
  const evidence: string[] = [
    `Financial Score ${Math.round(input.score)}/100`,
    `Danger Score ${Math.round(input.dangerScore)}/100`,
  ];

  if (revenueGrowth !== null) {
    evidence.push(`売上成長率 ${signedPercent(revenueGrowth)}`);
    if (revenueGrowth >= 20) positives.push({ label: `売上成長率 ${signedPercent(revenueGrowth)}`, tone: "positive" });
    if (revenueGrowth < 0) watches.push({ label: `売上成長率 ${signedPercent(revenueGrowth)}`, tone: "watch" });
    if (revenueGrowth < 10) nextChecks.push("売上成長率の再加速・減速継続");
  }

  if (operatingIncome !== null) {
    evidence.push(`営業利益 ${oku(operatingIncome)}`);
    if (operatingIncome > 0) positives.push({ label: `営業黒字 ${oku(operatingIncome)}`, tone: "positive" });
    else {
      watches.push({ label: `営業赤字 ${oku(operatingIncome)}`, tone: "watch" });
      nextChecks.push("営業利益の黒字転換・赤字幅の変化");
    }
  }

  if (operatingMargin !== null) {
    evidence.push(`営業利益率 ${signedPercent(operatingMargin)}`);
    if (operatingMargin >= 10) positives.push({ label: `営業利益率 ${operatingMargin.toFixed(1)}%`, tone: "positive" });
    if (operatingMargin < 0) watches.push({ label: `営業利益率 ${operatingMargin.toFixed(1)}%`, tone: "watch" });
  }

  if (operatingCF !== null) {
    evidence.push(`営業CF ${oku(operatingCF)}`);
    if (operatingCF > 0) positives.push({ label: `営業CF ${oku(operatingCF)}`, tone: "positive" });
    else {
      watches.push({ label: `営業CF ${oku(operatingCF)}`, tone: "watch" });
      nextChecks.push("営業CFの改善・黒字転換");
    }
  }

  if (operatingCFMargin !== null) {
    evidence.push(`営業CF率 ${signedPercent(operatingCFMargin)}`);
    if (operatingCFMargin >= 10) positives.push({ label: `営業CF率 ${operatingCFMargin.toFixed(1)}%`, tone: "positive" });
    if (operatingCFMargin < 0) watches.push({ label: `営業CF率 ${operatingCFMargin.toFixed(1)}%`, tone: "watch" });
  }

  if (equityRatio !== null) {
    evidence.push(`自己資本比率 ${equityRatio.toFixed(1)}%`);
    if (equityRatio >= 50) positives.push({ label: `自己資本比率 ${equityRatio.toFixed(1)}%`, tone: "positive" });
    if (equityRatio < 30) {
      watches.push({ label: `自己資本比率 ${equityRatio.toFixed(1)}%`, tone: equityRatio < 15 ? "danger" : "watch" });
      nextChecks.push("自己資本比率と資金調達の変化");
    }
  }

  if (input.score >= 80) positives.push({ label: `Financial Score ${Math.round(input.score)}`, tone: "positive" });
  if (input.dangerScore >= 40) watches.push({ label: `Danger Score ${Math.round(input.dangerScore)}`, tone: input.dangerScore >= 70 ? "danger" : "watch" });

  for (const flag of flags.slice(0, 5)) {
    const impact = finite(flag.scoreImpact);
    watches.push({
      label: impact !== null && impact > 0 ? `${flag.title} / Danger +${Math.round(impact)}` : flag.title,
      tone: /継続企業|MSワラント|債務超過|資金繰り/.test(flag.title) ? "danger" : "watch",
    });
    if (/MSワラント|増資|CB|新株予約権|希薄化/.test(flag.title)) nextChecks.push("希薄化を伴う資金調達の有無");
    if (/継続企業|資金繰り|債務超過/.test(flag.title)) nextChecks.push("継続企業・資金繰りに関する開示の更新");
  }

  if (operatingIncome !== null && operatingCF !== null && operatingIncome > 0 && operatingCF <= 0) {
    watches.push({ label: "営業黒字 / 営業CFマイナス", tone: "watch" });
    nextChecks.push("利益と営業CFの乖離縮小");
  }

  if (positives.length === 0) positives.push({ label: "現時点で強いプラスシグナルは未検出", tone: "neutral" });
  if (watches.length === 0) watches.push({ label: "主要警戒シグナルは限定的", tone: "neutral" });
  if (nextChecks.length === 0) nextChecks.push("次回決算の売上成長率・営業利益率・営業CFの継続性");

  return {
    ...verdictFor(input),
    headline: headlineFor(operatingIncome, operatingCF),
    positives: unique(positives, (item) => item.label).slice(0, 5),
    watches: unique(watches, (item) => item.label).slice(0, 5),
    nextChecks: [...new Set(nextChecks)].slice(0, 4),
    evidence: [...new Set(evidence)].slice(0, 8),
  };
}

export function insightToCompactComment(insight: FinancialInsight) {
  const positive = insight.positives[0]?.label ?? "-";
  const watch = insight.watches[0]?.label ?? "-";
  return `判定：${insight.verdict}。${insight.headline}。プラス：${positive}。警戒：${watch}。`;
}
