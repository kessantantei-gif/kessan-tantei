export type RankingMode =
  | "default"
  | "safe_growth"
  | "cashflow"
  | "high_risk_high_return";

export type RankingCompany = {
  ticker: string;
  companyName: string;
  score: number;
  dangerScore: number;
  riskLevel: string;
  revenue: number;
  operatingIncome: number;
  operatingCF: number;
};

export function rankingModeLabel(mode: RankingMode) {
  if (mode === "safe_growth") return "安全成長ランキング";
  if (mode === "cashflow") return "営業CF重視ランキング";
  if (mode === "high_risk_high_return") return "高リスク高スコアランキング";
  return "標準ランキング";
}

export function applyRankingMode(
  companies: RankingCompany[],
  mode: RankingMode
) {
  const copied = [...companies];

  if (mode === "safe_growth") {
    return copied
      .filter((company) => company.score >= 70)
      .filter((company) => company.dangerScore <= 30)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.dangerScore - b.dangerScore;
      });
  }

  if (mode === "cashflow") {
    return copied
      .filter((company) => company.operatingCF > 0)
      .sort((a, b) => {
        if (b.operatingCF !== a.operatingCF) {
          return b.operatingCF - a.operatingCF;
        }
        return b.score - a.score;
      });
  }

  if (mode === "high_risk_high_return") {
    return copied
      .filter((company) => company.score >= 80)
      .filter((company) => company.dangerScore >= 45)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.dangerScore - a.dangerScore;
      });
  }

  return copied.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.dangerScore - b.dangerScore;
  });
}