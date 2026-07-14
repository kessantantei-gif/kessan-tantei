import { calculateScores } from "./scoring-engine";

type MarketSegment = "growth" | "standard" | "prime" | "other";

type HistoryItem = {
  year?: string;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type Financials = Parameters<typeof calculateScores>[0];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

const modelDefinitions = {
  growth: {
    model: "growth_v1",
    version: "1.1",
    weights: { growth: 0.4, quality: 0.3, safety: 0.3 },
  },
  standard: {
    model: "standard_v1",
    version: "1.0",
    weights: { growth: 0.25, quality: 0.35, safety: 0.4 },
  },
  prime: {
    model: "prime_v1",
    version: "1.0",
    weights: { growth: 0.2, quality: 0.4, safety: 0.4 },
  },
  other: {
    model: "other_v1",
    version: "1.0",
    weights: { growth: 0.3, quality: 0.35, safety: 0.35 },
  },
} as const;

export function calculateMarketScores(
  marketSegment: MarketSegment,
  financials: Financials,
  history: HistoryItem[] = []
) {
  const base = calculateScores(financials, history);
  const definition = modelDefinitions[marketSegment] ?? modelDefinitions.other;

  const rawGrowth = base.growthScore / 0.4;
  const rawQuality = base.qualityScore / 0.3;
  const rawSafety = base.safetyScore / 0.3;

  let completenessPenalty = 0;
  if (base.operatingMargin === undefined) completenessPenalty += 4;
  if (base.ocfMargin === undefined) completenessPenalty += 4;
  if (base.equityRatio === undefined) completenessPenalty += 4;
  if (history.length < 2) completenessPenalty += 4;

  const weightedGrowth = rawGrowth * definition.weights.growth;
  const weightedQuality = rawQuality * definition.weights.quality;
  const weightedSafety = rawSafety * definition.weights.safety;
  const totalScore = clamp(
    weightedGrowth + weightedQuality + weightedSafety - completenessPenalty
  );

  return {
    scoringModel: definition.model,
    modelVersion: definition.version,
    totalScore: round1(totalScore),
    growthScore: round1(weightedGrowth),
    qualityScore: round1(weightedQuality),
    safetyScore: round1(weightedSafety),
    completenessPenalty,
    metrics: {
      operatingMargin: base.operatingMargin,
      ocfMargin: base.ocfMargin,
      equityRatio: base.equityRatio,
    },
    calculationBasis: {
      marketSegment,
      weights: definition.weights,
      historyCount: history.length,
      commonMetricsVersion: "1",
    },
    financialMetrics: base.financialMetrics,
  };
}

export type MarketScoreResult = ReturnType<typeof calculateMarketScores>;