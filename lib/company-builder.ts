import { calculateFinancialMetrics, type FinancialFacts } from "./financial-metrics";

export function buildCompanyData(
  ticker: string,
  financials: Omit<FinancialFacts, "grossProfit" | "netIncome"> &
    Partial<Pick<FinancialFacts, "grossProfit" | "netIncome">>,
  prior?: Partial<FinancialFacts>
) {
  const completeFinancials: FinancialFacts = {
    ...financials,
    grossProfit: financials.grossProfit ?? null,
    netIncome: financials.netIncome ?? null,
  };
  const metrics = calculateFinancialMetrics(completeFinancials, prior);
  const equityRatio = metrics.equityRatio;

  let score = 50;

  if (financials.revenue !== null && financials.revenue > 0) score += 10;
  if (financials.operatingIncome !== null && financials.operatingIncome > 0) score += 15;
  if (financials.operatingCF !== null && financials.operatingCF > 0) score += 15;
  if (equityRatio !== undefined && equityRatio > 50) score += 10;

  let dangerScore = 0;

  if (financials.operatingCF !== null && financials.operatingCF < 0) dangerScore += 30;
  if (financials.cash !== null && financials.currentLiabilities !== null && financials.cash < financials.currentLiabilities) dangerScore += 30;
  if (equityRatio !== undefined && equityRatio < 30) dangerScore += 20;

  return {
    ticker,
    ...financials,
    ...metrics,
    score,
    dangerScore,
  };
}
