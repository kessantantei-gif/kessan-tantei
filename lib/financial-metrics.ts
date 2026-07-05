export type FinancialFacts = {
  revenue: number | null;
  grossProfit: number | null;
  netIncome: number | null;
  operatingIncome: number | null;
  operatingCF: number | null;
  cash: number | null;
  currentLiabilities: number | null;
  assets: number | null;
  netAssets: number | null;
};

export type DisclosureMetricInput = {
  goingConcern: boolean;
  msWarrant: boolean;
  auditorChanged: boolean;
};

export type CalculatedFinancialMetrics = Partial<FinancialFacts> & {
  operatingMargin?: number;
  grossMargin?: number;
  netMargin?: number;
  operatingCFMargin?: number;
  ocfMargin?: number;
  revenueGrowth?: number;
  grossProfitGrowth?: number;
  operatingIncomeGrowth?: number;
  netIncomeGrowth?: number;
  operatingCFGrowth?: number;
  equityRatio?: number;
  cashRatio?: number;
  equityAmount?: number;
  cashAndDeposits?: number;
  totalAssetTurnover?: number;
  operatingCFNegative?: boolean;
  operatingLoss?: boolean;
  consecutiveOperatingLoss?: boolean;
  goingConcern?: boolean;
  msWarrant?: boolean;
  auditorChanged?: boolean;
};

function round(value: number) {
  return Number(value.toFixed(2));
}

function ratio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return undefined;
  return round((numerator / denominator) * 100);
}

function growth(current: number | null, prior: number | null) {
  if (current === null || prior === null || prior === 0) return undefined;
  return round(((current - prior) / Math.abs(prior)) * 100);
}

export function calculateFinancialMetrics(
  current: FinancialFacts,
  prior?: Partial<FinancialFacts>,
  disclosure?: DisclosureMetricInput
): CalculatedFinancialMetrics {
  const metrics: CalculatedFinancialMetrics = {};

  for (const [key, value] of Object.entries(current)) {
    if (value !== null) {
      (metrics as Record<string, number | boolean>)[key] = value;
    }
  }

  const operatingMargin = ratio(current.operatingIncome, current.revenue);
  const grossMargin = ratio(current.grossProfit, current.revenue);
  const netMargin = ratio(current.netIncome, current.revenue);
  const operatingCFMargin = ratio(current.operatingCF, current.revenue);
  const equityRatio = ratio(current.netAssets, current.assets);
  const cashRatio = ratio(current.cash, current.currentLiabilities);

  if (operatingMargin !== undefined) metrics.operatingMargin = operatingMargin;
  if (grossMargin !== undefined) metrics.grossMargin = grossMargin;
  if (netMargin !== undefined) metrics.netMargin = netMargin;
  if (operatingCFMargin !== undefined) {
    metrics.operatingCFMargin = operatingCFMargin;
    metrics.ocfMargin = operatingCFMargin;
  }
  if (equityRatio !== undefined) metrics.equityRatio = equityRatio;
  if (cashRatio !== undefined) metrics.cashRatio = cashRatio;
  if (current.netAssets !== null) metrics.equityAmount = current.netAssets;
  if (current.cash !== null) metrics.cashAndDeposits = current.cash;
  if (current.revenue !== null && current.assets !== null && current.assets !== 0) {
    metrics.totalAssetTurnover = round(current.revenue / current.assets);
  }

  const revenueGrowth = growth(current.revenue, prior?.revenue ?? null);
  const grossProfitGrowth = growth(current.grossProfit, prior?.grossProfit ?? null);
  const operatingIncomeGrowth = growth(current.operatingIncome, prior?.operatingIncome ?? null);
  const netIncomeGrowth = growth(current.netIncome, prior?.netIncome ?? null);
  const operatingCFGrowth = growth(current.operatingCF, prior?.operatingCF ?? null);

  if (revenueGrowth !== undefined) metrics.revenueGrowth = revenueGrowth;
  if (grossProfitGrowth !== undefined) metrics.grossProfitGrowth = grossProfitGrowth;
  if (operatingIncomeGrowth !== undefined) metrics.operatingIncomeGrowth = operatingIncomeGrowth;
  if (netIncomeGrowth !== undefined) metrics.netIncomeGrowth = netIncomeGrowth;
  if (operatingCFGrowth !== undefined) metrics.operatingCFGrowth = operatingCFGrowth;

  if (current.operatingCF !== null) metrics.operatingCFNegative = current.operatingCF < 0;
  if (current.operatingIncome !== null) metrics.operatingLoss = current.operatingIncome < 0;
  if (current.operatingIncome !== null && prior?.operatingIncome != null) {
    metrics.consecutiveOperatingLoss =
      current.operatingIncome < 0 && prior.operatingIncome < 0;
  }

  if (disclosure) {
    metrics.goingConcern = disclosure.goingConcern;
    metrics.msWarrant = disclosure.msWarrant;
    metrics.auditorChanged = disclosure.auditorChanged;
  }

  return metrics;
}
