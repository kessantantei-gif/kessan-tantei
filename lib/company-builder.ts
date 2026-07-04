export function buildCompanyData(
  ticker: string,
  financials: {
    revenue: number;
    operatingIncome: number;
    operatingCF: number;
    cash: number;
    currentLiabilities: number;
    assets: number;
    netAssets: number;
  }
) {
  const equityRatio =
    financials.assets > 0
      ? (financials.netAssets / financials.assets) * 100
      : 0;

  let score = 50;

  if (financials.revenue > 0) score += 10;
  if (financials.operatingIncome > 0) score += 15;
  if (financials.operatingCF > 0) score += 15;
  if (equityRatio > 50) score += 10;

  let dangerScore = 0;

  if (financials.operatingCF < 0) dangerScore += 30;
  if (financials.cash < financials.currentLiabilities) dangerScore += 30;
  if (equityRatio < 30) dangerScore += 20;

  return {
    ticker,
    ...financials,
    equityRatio: Number(equityRatio.toFixed(2)),
    score,
    dangerScore,
  };
}