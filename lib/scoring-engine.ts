import { calculateFinancialMetrics, type FinancialFacts } from "./financial-metrics";

type HistoryItem = {
  year?: string;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type Financials = Omit<FinancialFacts, "grossProfit" | "netIncome"> &
  Partial<Pick<FinancialFacts, "grossProfit" | "netIncome">>;

function completeFacts(financials: Financials): FinancialFacts {
  return {
    ...financials,
    grossProfit: financials.grossProfit ?? null,
    netIncome: financials.netIncome ?? null,
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function scoreRange(value: number, min: number, max: number) {
  if (max === min) return 0;
  return clamp(((value - min) / (max - min)) * 100);
}

function calcGrowthRate(current: number, previous: number) {
  if (!previous || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateRevenueGrowthScore(financials: Financials, history: HistoryItem[]) {
  const validHistory = history.filter(
    (item) => typeof item.revenue === "number" && Number.isFinite(item.revenue)
  );

  if (validHistory.length >= 2) {
    const growthRates: number[] = [];

    for (let i = 1; i < validHistory.length; i++) {
      const previous = validHistory[i - 1].revenue ?? 0;
      const current = validHistory[i].revenue ?? 0;
      const growth = calcGrowthRate(current, previous);

      if (growth !== null && Number.isFinite(growth)) {
        growthRates.push(growth);
      }
    }

    const avgGrowth = average(growthRates);

    if (avgGrowth !== null) {
      // -20%以下 = 0点、+80%以上 = 100点
      return scoreRange(avgGrowth, -20, 80);
    }
  }

  // 比較可能な履歴がない場合は、売上があるだけでは高得点にしない
  if (financials.revenue !== null && financials.revenue > 0) return 35;
  return 0;
}

function calculateProfitabilityScore(
  metrics: ReturnType<typeof calculateFinancialMetrics>
) {
  const operatingMargin = metrics.operatingMargin;
  const ocfMargin = metrics.operatingCFMargin;

  const operatingMarginScore =
    operatingMargin === undefined ? 0 : scoreRange(operatingMargin, -30, 30);
  const ocfMarginScore =
    ocfMargin === undefined ? 0 : scoreRange(ocfMargin, -30, 30);

  return {
    operatingMargin,
    ocfMargin,
    score: operatingMarginScore * 0.55 + ocfMarginScore * 0.45,
  };
}

function calculateStabilityScore(
  metrics: ReturnType<typeof calculateFinancialMetrics>,
  history: HistoryItem[]
) {
  const equityRatio = metrics.equityRatio;
  const cashCoverage =
    metrics.cashRatio !== undefined ? metrics.cashRatio / 100 : undefined;

  const equityScore =
    equityRatio === undefined ? 0 : scoreRange(equityRatio, 10, 80);
  const cashCoverageScore =
    cashCoverage === undefined ? 0 : scoreRange(cashCoverage, 0.2, 2.5);

  const validHistory = history.filter(
    (item) =>
      typeof item.operatingCF === "number" && Number.isFinite(item.operatingCF)
  );

  let ocfConsistencyScore = 0;

  if (validHistory.length > 0) {
    const positiveCount = validHistory.filter(
      (item) => (item.operatingCF ?? 0) > 0
    ).length;

    ocfConsistencyScore = (positiveCount / validHistory.length) * 100;
  }

  return {
    equityRatio,
    cashCoverage,
    score:
      equityScore * 0.4 +
      cashCoverageScore * 0.35 +
      ocfConsistencyScore * 0.25,
  };
}

export function calculateScores(financials: Financials, history: HistoryItem[] = []) {
  const financialMetrics = calculateFinancialMetrics(completeFacts(financials));
  const revenueGrowthScore = calculateRevenueGrowthScore(financials, history);
  const profitability = calculateProfitabilityScore(financialMetrics);
  const stability = calculateStabilityScore(financialMetrics, history);

  const growthScore = round1(revenueGrowthScore * 0.4);
  const qualityScore = round1(profitability.score * 0.3);
  const safetyScore = round1(stability.score * 0.3);

  const rawTotalScore = growthScore + qualityScore + safetyScore;

  // 欠損値を好条件として扱わず、確認できる指標だけで評価する。
  let totalScore = rawTotalScore;

  if (profitability.operatingMargin === undefined) totalScore -= 4;
  else if (profitability.operatingMargin < 5) totalScore -= 4;

  if (profitability.ocfMargin === undefined) totalScore -= 4;
  else if (profitability.ocfMargin < 5) totalScore -= 4;

  if (stability.equityRatio === undefined) totalScore -= 4;
  else if (stability.equityRatio < 30) totalScore -= 4;

  if (stability.cashCoverage === undefined) totalScore -= 4;
  else if (stability.cashCoverage < 1) totalScore -= 4;

  totalScore = clamp(totalScore, 0, 100);

  return {
    growthScore: round1(growthScore),
    qualityScore: round1(qualityScore),
    safetyScore: round1(safetyScore),
    totalScore: round1(totalScore),
    operatingMargin:
      profitability.operatingMargin === undefined
        ? undefined
        : round1(profitability.operatingMargin),
    ocfMargin:
      profitability.ocfMargin === undefined
        ? undefined
        : round1(profitability.ocfMargin),
    equityRatio:
      stability.equityRatio === undefined
        ? undefined
        : round1(stability.equityRatio),
    financialMetrics,
  };
}
