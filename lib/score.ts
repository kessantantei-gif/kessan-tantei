export type CompanyMetrics = {
  revenueGrowth: number;
  grossProfitGrowth: number;
  operatingMargin: number;
  ebitdaMargin: number;
  ocfMargin: number;
  ruleOf40: number;
  operatingCashFlows: number[];
  operatingIncomes: number[];
  cash: number;
  monthlyCashBurn: number;
  currentLiabilities: number;
  equityRatio: number;
  hasMsWarrant: boolean;
  equityFinancingCountLast3Years: number;
  warrantTrend: "none" | "stable" | "increasing";
  cbTrend: "none" | "stable" | "increasing";
};

export type CompanyScore = {
  growthScore: number;
  safetyScore: number;
  dilutionScore: number;
  totalScore: number;
  rank: "S" | "A" | "B" | "C" | "D";
};

function scoreGrowth(value: number) {
  if (value >= 50) return 100;
  if (value >= 30) return 85;
  if (value >= 20) return 70;
  if (value >= 10) return 50;
  if (value >= 0) return 30;
  return 10;
}

function scoreMargin(value: number) {
  if (value >= 20) return 100;
  if (value >= 10) return 85;
  if (value >= 0) return 70;
  if (value >= -10) return 45;
  if (value >= -20) return 25;
  return 10;
}

function scoreRunway(cash: number, monthlyCashBurn: number) {
  if (monthlyCashBurn <= 0) return 100;
  const months = cash / monthlyCashBurn;
  if (months >= 36) return 100;
  if (months >= 24) return 85;
  if (months >= 12) return 65;
  if (months >= 6) return 35;
  return 10;
}

function scoreCashCoverage(cash: number, currentLiabilities: number) {
  if (currentLiabilities <= 0) return 100;
  const ratio = cash / currentLiabilities;
  if (ratio >= 2) return 100;
  if (ratio >= 1) return 80;
  if (ratio >= 0.5) return 45;
  return 15;
}

function scoreEquityRatio(value: number) {
  if (value >= 70) return 100;
  if (value >= 50) return 80;
  if (value >= 30) return 55;
  if (value >= 15) return 30;
  return 10;
}

function getRank(totalScore: number): CompanyScore["rank"] {
  if (totalScore >= 85) return "S";
  if (totalScore >= 70) return "A";
  if (totalScore >= 55) return "B";
  if (totalScore >= 40) return "C";
  return "D";
}

export function scoreCompany(metrics: CompanyMetrics): CompanyScore {
  const growthScore = Math.round(
    scoreGrowth(metrics.revenueGrowth) * 0.6 +
      scoreGrowth(metrics.grossProfitGrowth) * 0.4
  );

  const safetyScore = Math.round(
    scoreMargin(metrics.operatingMargin) * 0.35 +
      scoreMargin(metrics.ocfMargin) * 0.25 +
      scoreRunway(metrics.cash, metrics.monthlyCashBurn) * 0.15 +
      scoreCashCoverage(metrics.cash, metrics.currentLiabilities) * 0.15 +
      scoreEquityRatio(metrics.equityRatio) * 0.1
  );

  let dilutionScore = 100;

  if (metrics.hasMsWarrant) dilutionScore -= 45;
  if (metrics.equityFinancingCountLast3Years >= 2) dilutionScore -= 25;
  if (metrics.equityFinancingCountLast3Years === 1) dilutionScore -= 10;
  if (metrics.warrantTrend === "increasing") dilutionScore -= 20;
  if (metrics.cbTrend === "increasing") dilutionScore -= 20;

  dilutionScore = Math.max(0, dilutionScore);

  const totalScore = Math.round(
    growthScore * 0.3 + safetyScore * 0.45 + dilutionScore * 0.25
  );

  return {
    growthScore,
    safetyScore,
    dilutionScore,
    totalScore,
    rank: getRank(totalScore),
  };
}