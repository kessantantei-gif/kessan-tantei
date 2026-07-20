import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

const parserPath = "lib/edinet-parser.ts";
replaceOnce(
  parserPath,
  `export type EdinetFinancials = {\n  revenue: number;\n  operatingIncome: number;`,
  `export type EdinetFinancials = {\n  revenue: number;\n  grossProfit: number | null;\n  netIncome: number | null;\n  operatingIncome: number;`,
  "edinet financial type"
);

replaceOnce(
  parserPath,
  `    revenue: 0,\n    operatingIncome: 0,`,
  `    revenue: 0,\n    grossProfit: null,\n    netIncome: null,\n    operatingIncome: 0,`,
  "empty financial values"
);

replaceOnce(
  parserPath,
  `    revenue: chooseNumber(primary.revenue, fallback.revenue),\n    operatingIncome: chooseNumber(primary.operatingIncome, fallback.operatingIncome),`,
  `    revenue: chooseNumber(primary.revenue, fallback.revenue),\n    grossProfit: chooseNullableNumber(primary.grossProfit, fallback.grossProfit),\n    netIncome: chooseNullableNumber(primary.netIncome, fallback.netIncome),\n    operatingIncome: chooseNumber(primary.operatingIncome, fallback.operatingIncome),`,
  "merge gross and net income"
);

replaceOnce(
  parserPath,
  `function chooseNumber(primary: number, fallback: number) {\n  return primary !== 0 ? primary : fallback;\n}\n`,
  `function chooseNumber(primary: number, fallback: number) {\n  return primary !== 0 ? primary : fallback;\n}\n\nfunction chooseNullableNumber(\n  primary: number | null,\n  fallback: number | null\n) {\n  return primary !== null ? primary : fallback;\n}\n`,
  "nullable merge helper"
);

replaceOnce(
  parserPath,
  `    operatingIncome: extractFact(\n      facts,\n      contexts,\n      durationContext,\n      definition.operatingIncomeElements\n    ),`,
  `    grossProfit: extractNullableFact(\n      facts,\n      contexts,\n      durationContext,\n      [\n        "GrossProfitSummaryOfBusinessResults",\n        "GrossProfitLossSummaryOfBusinessResults",\n        "GrossProfit",\n        "GrossProfitLoss",\n        "GrossProfitIFRS",\n        "GrossProfitLossIFRS",\n      ]\n    ),\n    netIncome: extractNullableFact(\n      facts,\n      contexts,\n      durationContext,\n      [\n        "ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults",\n        "ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults",\n        "ProfitLossAttributableToOwnersOfParent",\n        "ProfitAttributableToOwnersOfParent",\n        "ProfitLossAttributableToOwnersOfParentIFRS",\n        "ProfitAttributableToOwnersOfParentIFRS",\n        "NetIncomeSummaryOfBusinessResults",\n        "NetIncome",\n        "NetIncomeLoss",\n        "ProfitLoss",\n      ]\n    ),\n    operatingIncome: extractFact(\n      facts,\n      contexts,\n      durationContext,\n      definition.operatingIncomeElements\n    ),`,
  "extract gross and net income"
);

replaceOnce(
  parserPath,
  `function contextScoreSafe(context: ContextInfo | undefined) {`,
  `function extractNullableFact(\n  facts: NumericFact[],\n  contexts: Map<string, ContextInfo>,\n  preferredContext: ContextInfo | undefined,\n  suffixes: string[]\n): number | null {\n  const rank = new Map(suffixes.map((suffix, index) => [suffix, index]));\n  const candidates = facts\n    .filter((fact) => rank.has(localName(fact.name)))\n    .map((fact) => ({ fact, context: contexts.get(fact.contextRef) }))\n    .sort((a, b) => {\n      const score = (candidate: {\n        fact: NumericFact;\n        context: ContextInfo | undefined;\n      }) => {\n        const preferred =\n          preferredContext && candidate.fact.contextRef === preferredContext.id\n            ? 10_000\n            : 0;\n        const elementRank =\n          rank.get(localName(candidate.fact.name)) ?? suffixes.length;\n        const elementPriority = (suffixes.length - elementRank) * 10;\n        return preferred + contextScoreSafe(candidate.context) * 10 + elementPriority;\n      };\n\n      return score(b) - score(a);\n    });\n\n  return candidates[0]?.fact.value ?? null;\n}\n\nfunction contextScoreSafe(context: ContextInfo | undefined) {`,
  "nullable fact extractor"
);

const analyzePath = "scripts/analyze-company.ts";
replaceOnce(
  analyzePath,
  `import { calculateMarketScores } from "../lib/market-scoring-engine";`,
  `import { calculateMarketScores } from "../lib/market-scoring-engine";\nimport { calculateFinancialMetrics } from "../lib/financial-metrics";`,
  "financial metrics import"
);

replaceOnce(
  analyzePath,
  `  revenue: number;\n  operatingIncome: number;`,
  `  revenue: number;\n  grossProfit: number | null;\n  netIncome: number | null;\n  operatingIncome: number;`,
  "history financial fields"
);

replaceOnce(
  analyzePath,
  `    revenue: financials.revenue,\n    operatingIncome: financials.operatingIncome,`,
  `    revenue: financials.revenue,\n    grossProfit: financials.grossProfit,\n    netIncome: financials.netIncome,\n    operatingIncome: financials.operatingIncome,`,
  "history gross and net values"
);

replaceOnce(
  analyzePath,
  `  const currentAuditorType = classifyAuditor(\n    disclosureSignals.currentAuditorName\n  );\n\n  const redFlags = analyzeRedFlags({`,
  `  const currentAuditorType = classifyAuditor(\n    disclosureSignals.currentAuditorName\n  );\n  const previousFinancials = history.length >= 2 ? history.at(-2) : undefined;\n  const calculatedFinancials = calculateFinancialMetrics(\n    {\n      revenue: financials.revenue,\n      grossProfit: financials.grossProfit,\n      netIncome: financials.netIncome,\n      operatingIncome: financials.operatingIncome,\n      operatingCF: financials.operatingCF,\n      cash: financials.cash,\n      currentLiabilities: financials.currentLiabilities,\n      assets: financials.assets,\n      netAssets: financials.netAssets,\n    },\n    previousFinancials\n  );\n  const storedFinancials = {\n    ...financials,\n    ...calculatedFinancials,\n  };\n\n  const redFlags = analyzeRedFlags({`,
  "calculate stored ranking metrics"
);

replaceOnce(
  analyzePath,
  `    financials,\n    history,\n    risk: redFlags,`,
  `    financials: storedFinancials,\n    history,\n    risk: redFlags,`,
  "store enriched financials"
);

replaceOnce(
  analyzePath,
  `      financials,\n      history,\n      scores,`,
  `      financials: storedFinancials,\n      history,\n      scores,`,
  "store normalized enriched financials"
);

const marketRankingPath = "components/market-ranking-page.tsx";
replaceOnce(
  marketRankingPath,
  `const COMPARISON_REQUIRED_SLUGS = new Set([\n  "revenue-growth",\n  "high-growth",\n  "profitable-high-growth",\n  "featured-companies",\n  "recommended",\n  "rule-of-40",\n  "rule40-excellent",\n  "gross-profit-growth",\n  "operating-income-growth",\n  "net-income-growth",\n  "ocf-growth",\n  "revenue-cagr-3y",\n  "margin-improvement",\n  "ocf-improvement",\n]);\n\n`,
  ``,
  "remove forced empty ranking set"
);

replaceOnce(
  marketRankingPath,
  `function shouldKeepEmptyRanking(ranking: RankingDefinition) {\n  return COMPARISON_REQUIRED_SLUGS.has(ranking.slug);\n}\n\nfunction getVisibleRankings(companies: RankingCompany[]) {\n  return rankingDefinitions.filter((ranking) => {\n    const hasCompanies = rankCompanies(companies, ranking).length > 0;\n    return hasCompanies || shouldKeepEmptyRanking(ranking);\n  });\n}`,
  `function getVisibleRankings(companies: RankingCompany[]) {\n  return rankingDefinitions.filter(\n    (ranking) => rankCompanies(companies, ranking).length > 0\n  );\n}`,
  "hide empty rankings"
);

console.log("Market ranking code patch applied");
