import {
  generateFinancialInsight,
  insightToCompactComment,
} from "@/lib/financial-insight-engine";

export function generateComment(data: {
  score: number;
  dangerScore: number;
  riskLevel: string;
  operatingCF: number;
  revenue: number;
  operatingIncome: number;
  revenueGrowth?: number | null;
  operatingMargin?: number | null;
  operatingCFMargin?: number | null;
  equityRatio?: number | null;
  flags?: { title: string; scoreImpact?: number | null }[];
}) {
  return insightToCompactComment(
    generateFinancialInsight({
      score: data.score,
      dangerScore: data.dangerScore,
      riskLevel: data.riskLevel,
      revenue: data.revenue,
      revenueGrowth: data.revenueGrowth,
      operatingIncome: data.operatingIncome,
      operatingMargin: data.operatingMargin,
      operatingCF: data.operatingCF,
      operatingCFMargin: data.operatingCFMargin,
      equityRatio: data.equityRatio,
      flags: data.flags,
    })
  );
}
