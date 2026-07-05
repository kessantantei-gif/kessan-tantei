import type { RankingDefinition } from "./types";

const FREE_RANKING_SLUGS = new Set([
  "score",
  "a-rank",
  "safe-companies",
  "featured-companies",
  "revenue-growth",
  "revenue",
  "operating-margin",
  "operating-income",
  "gross-margin",
  "operating-cash-flow",
  "positive-ocf",
  "equity-ratio",
  "cash-ratio",
]);

const ALWAYS_PREMIUM_SLUGS = new Set([
  "s-rank",
  "recommended",
  "risk-signal",
  "ocf-deterioration",
  "operating-loss",
  "continuous-loss",
  "capital-increase-risk",
  "ms-warrant",
  "auditor-change",
  "going-concern",
  "financial-deterioration",
  "watch-companies",
  "roe",
  "roa",
  "roic",
  "ebitda",
  "free-cash-flow",
  "net-cash",
  "current-ratio",
  "quick-ratio",
  "de-ratio",
]);

export function isPremiumRanking(definition: RankingDefinition) {
  if (ALWAYS_PREMIUM_SLUGS.has(definition.slug)) return true;
  if (FREE_RANKING_SLUGS.has(definition.slug)) return false;

  return ["risk", "theme", "industry"].includes(definition.category);
}

export function premiumRankingMessage(definition: RankingDefinition) {
  if (definition.category === "risk") {
    return "リスクシグナルや財務異変の詳細ランキングはPro限定です。";
  }

  if (definition.category === "industry") {
    return "業種・領域別の詳細ランキングはPro限定です。";
  }

  if (definition.category === "theme") {
    return "テーマ別の詳細ランキングはPro限定です。";
  }

  return "このランキングの詳細表示はPro限定です。";
}
