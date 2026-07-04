type HistoryItem = {
  year?: string;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type Financials = {
  revenue: number;
  operatingIncome: number;
  operatingCF: number;
  cash: number;
  currentLiabilities: number;
  assets: number;
  netAssets: number;
};

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
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateRevenueGrowthScore(financials: Financials, history: HistoryItem[]) {
  const validHistory = history.filter((item) => typeof item.revenue === "number");

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

    // -20%以下 = 0点、+80%以上 = 100点
    return scoreRange(avgGrowth, -20, 80);
  }

  // 履歴がない場合は、売上があるだけでは満点にしない
  if (financials.revenue > 0) return 45;
  return 10;
}

function calculateProfitabilityScore(financials: Financials) {
  const operatingMargin =
    financials.revenue > 0
      ? (financials.operatingIncome / financials.revenue) * 100
      : -50;

  const ocfMargin =
    financials.revenue > 0
      ? (financials.operatingCF / financials.revenue) * 100
      : -50;

  const operatingMarginScore = scoreRange(operatingMargin, -30, 30);
  const ocfMarginScore = scoreRange(ocfMargin, -30, 30);

  return {
    operatingMargin,
    ocfMargin,
    score: operatingMarginScore * 0.55 + ocfMarginScore * 0.45,
  };
}

function calculateStabilityScore(financials: Financials, history: HistoryItem[]) {
  const equityRatio =
    financials.assets > 0
      ? (financials.netAssets / financials.assets) * 100
      : 0;

  const cashCoverage =
    financials.currentLiabilities > 0
      ? financials.cash / financials.currentLiabilities
      : 2;

  const equityScore = scoreRange(equityRatio, 10, 80);
  const cashCoverageScore = scoreRange(cashCoverage, 0.2, 2.5);

  const validHistory = history.filter(
    (item) => typeof item.operatingCF === "number"
  );

  let ocfConsistencyScore = 50;

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
  const revenueGrowthScore = calculateRevenueGrowthScore(financials, history);
  const profitability = calculateProfitabilityScore(financials);
  const stability = calculateStabilityScore(financials, history);

  const growthScore = round1(revenueGrowthScore * 0.4);
  const qualityScore = round1(profitability.score * 0.3);
  const safetyScore = round1(stability.score * 0.3);

  const rawTotalScore = growthScore + qualityScore + safetyScore;

  // 100点乱発防止。満点はかなり厳しくする。
  let totalScore = rawTotalScore;

  if (profitability.operatingMargin < 5) totalScore -= 4;
  if (profitability.ocfMargin < 5) totalScore -= 4;
  if (stability.equityRatio < 30) totalScore -= 4;
  if (stability.cashCoverage < 1) totalScore -= 4;

  totalScore = clamp(totalScore, 0, 100);

  return {
    growthScore: round1(growthScore),
    qualityScore: round1(qualityScore),
    safetyScore: round1(safetyScore),
    totalScore: round1(totalScore),
    operatingMargin: round1(profitability.operatingMargin),
    ocfMargin: round1(profitability.ocfMargin),
    equityRatio: round1(stability.equityRatio),
  };
}