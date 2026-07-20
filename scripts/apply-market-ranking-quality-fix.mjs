import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

const csvParserPath = "lib/edinet-financial-parser.ts";
replaceOnce(
  csvParserPath,
  `    revenueElements: [\n      "RevenueIFRSSummaryOfBusinessResults",\n      "Revenue2IFRS",\n      "RevenueIFRS",\n      "RevenueFromExternalCustomers2IFRS",\n      "OperatingRevenueIFRS",\n    ],\n    revenueLabels: ["売上収益（IFRS）、経営指標等", "売上収益（IFRS）", "収益（IFRS）"],`,
  `    revenueElements: [\n      "SalesAndFinancialServicesRevenueIFRSKeyFinancialData",\n      "OperatingRevenuesIFRSKeyFinancialData",\n      "NetSalesIFRSKeyFinancialData",\n      "RevenueIFRSKeyFinancialData",\n      "RevenueIFRSSummaryOfBusinessResults",\n      "NetSalesSummaryOfBusinessResults",\n      "OperatingRevenueSummaryOfBusinessResults",\n      "TotalNetRevenuesIFRS",\n      "NetSalesIFRS",\n      "SalesRevenuesIFRS",\n      "Revenue2IFRS",\n      "RevenueIFRS",\n      "RevenueFromExternalCustomers2IFRS",\n      "OperatingRevenueIFRS",\n    ],\n    revenueLabels: [\n      "売上収益（IFRS）、経営指標等",\n      "売上高、経営指標等",\n      "営業収益、経営指標等",\n      "売上収益（IFRS）",\n      "売上高（IFRS）",\n      "収益（IFRS）",\n    ],`,
  "CSV IFRS revenue priorities"
);

replaceOnce(
  csvParserPath,
  `    revenueElements: [\n      "OperatingRevenue1SummaryOfBusinessResults",\n      "OperatingRevenue1",\n      "OperatingRevenueIVT",\n      "OperatingRevenues",\n      "OperatingRevenue",\n    ],\n    revenueLabels: ["営業収益、経営指標等", "営業収益"],`,
  `    revenueElements: [\n      "OperatingRevenue1SummaryOfBusinessResults",\n      "OperatingRevenue1",\n      "OperatingRevenueIVT",\n      "OperatingRevenues",\n      "OperatingRevenue",\n      "NetSalesSummaryOfBusinessResults",\n      "RevenueSummaryOfBusinessResults",\n      "NetSales",\n      "Revenue",\n    ],\n    revenueLabels: ["営業収益、経営指標等", "売上高、経営指標等", "営業収益", "売上高"],`,
  "CSV operating revenue fallback"
);

replaceOnce(
  csvParserPath,
  `  const grossProfit = pickFact({\n    rows,\n    elementNames: ["GrossProfit", "GrossProfitLoss"],`,
  `  const grossProfit = pickFact({\n    rows,\n    elementNames: [\n      "GrossProfitSummaryOfBusinessResults",\n      "GrossProfitLossSummaryOfBusinessResults",\n      "GrossProfitIFRS",\n      "GrossProfitLossIFRS",\n      "GrossProfit",\n      "GrossProfitLoss",\n    ],`,
  "CSV current gross profit priorities"
);

replaceOnce(
  csvParserPath,
  `  const priorGrossProfit = pickFact({\n    rows,\n    elementNames: ["GrossProfit", "GrossProfitLoss"],`,
  `  const priorGrossProfit = pickFact({\n    rows,\n    elementNames: [\n      "GrossProfitSummaryOfBusinessResults",\n      "GrossProfitLossSummaryOfBusinessResults",\n      "GrossProfitIFRS",\n      "GrossProfitLossIFRS",\n      "GrossProfit",\n      "GrossProfitLoss",\n    ],`,
  "CSV prior gross profit priorities"
);

replaceOnce(
  csvParserPath,
  `  const netIncomeElements = [\n    "ProfitLossAttributableToOwnersOfParent",\n    "ProfitAttributableToOwnersOfParent",\n    "ProfitLoss",\n    "NetIncome",\n    "NetIncomeLoss",\n  ];`,
  `  const netIncomeElements = [\n    "ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults",\n    "ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults",\n    "NetIncomeSummaryOfBusinessResults",\n    "ProfitLossAttributableToOwnersOfParent",\n    "ProfitAttributableToOwnersOfParent",\n    "ProfitLossAttributableToOwnersOfParentIFRS",\n    "ProfitAttributableToOwnersOfParentIFRS",\n    "NetIncome",\n    "NetIncomeLoss",\n    "ProfitLoss",\n  ];`,
  "CSV net income priorities"
);

replaceOnce(
  csvParserPath,
  `  if (\n    elements.has("RevenueIFRSSummaryOfBusinessResults") ||\n    elements.has("Revenue2IFRS") ||\n    elements.has("RevenueIFRS") ||\n    elements.has("OperatingProfitLossIFRS")\n  ) {`,
  `  if (\n    elements.has("SalesAndFinancialServicesRevenueIFRSKeyFinancialData") ||\n    elements.has("OperatingRevenuesIFRSKeyFinancialData") ||\n    elements.has("NetSalesIFRSKeyFinancialData") ||\n    elements.has("RevenueIFRSKeyFinancialData") ||\n    elements.has("RevenueIFRSSummaryOfBusinessResults") ||\n    elements.has("Revenue2IFRS") ||\n    elements.has("RevenueIFRS") ||\n    elements.has("OperatingProfitLossIFRS")\n  ) {`,
  "CSV IFRS profile markers"
);

const xbrlParserPath = "lib/edinet-parser.ts";
replaceOnce(
  xbrlParserPath,
  `    revenueElements: [\n      "RevenueIFRSSummaryOfBusinessResults",\n      "Revenue2IFRS",\n      "RevenueIFRS",\n      "RevenueFromExternalCustomers2IFRS",\n      "OperatingRevenueIFRS",\n    ],`,
  `    revenueElements: [\n      "SalesAndFinancialServicesRevenueIFRSKeyFinancialData",\n      "OperatingRevenuesIFRSKeyFinancialData",\n      "NetSalesIFRSKeyFinancialData",\n      "RevenueIFRSKeyFinancialData",\n      "RevenueIFRSSummaryOfBusinessResults",\n      "NetSalesSummaryOfBusinessResults",\n      "OperatingRevenueSummaryOfBusinessResults",\n      "TotalNetRevenuesIFRS",\n      "NetSalesIFRS",\n      "SalesRevenuesIFRS",\n      "Revenue2IFRS",\n      "RevenueIFRS",\n      "RevenueFromExternalCustomers2IFRS",\n      "OperatingRevenueIFRS",\n    ],`,
  "XBRL IFRS revenue priorities"
);

replaceOnce(
  xbrlParserPath,
  `    revenueElements: [\n      "OperatingRevenue1SummaryOfBusinessResults",\n      "OperatingRevenue1",\n      "OperatingRevenueIVT",\n      "OperatingRevenues",\n      "OperatingRevenue",\n    ],`,
  `    revenueElements: [\n      "OperatingRevenue1SummaryOfBusinessResults",\n      "OperatingRevenue1",\n      "OperatingRevenueIVT",\n      "OperatingRevenues",\n      "OperatingRevenue",\n      "NetSalesSummaryOfBusinessResults",\n      "RevenueSummaryOfBusinessResults",\n      "NetSales",\n      "Revenue",\n    ],`,
  "XBRL operating revenue fallback"
);

replaceOnce(
  xbrlParserPath,
  `        "GrossProfitSummaryOfBusinessResults",\n        "GrossProfitLossSummaryOfBusinessResults",\n        "GrossProfit",\n        "GrossProfitLoss",\n        "GrossProfitIFRS",\n        "GrossProfitLossIFRS",`,
  `        "GrossProfitSummaryOfBusinessResults",\n        "GrossProfitLossSummaryOfBusinessResults",\n        "GrossProfitIFRS",\n        "GrossProfitLossIFRS",\n        "GrossProfit",\n        "GrossProfitLoss",`,
  "XBRL gross profit priorities"
);

replaceOnce(
  xbrlParserPath,
  `  if (\n    elements.has("RevenueIFRSSummaryOfBusinessResults") ||\n    elements.has("Revenue2IFRS") ||\n    elements.has("RevenueIFRS") ||\n    elements.has("OperatingProfitLossIFRS")\n  ) {`,
  `  if (\n    elements.has("SalesAndFinancialServicesRevenueIFRSKeyFinancialData") ||\n    elements.has("OperatingRevenuesIFRSKeyFinancialData") ||\n    elements.has("NetSalesIFRSKeyFinancialData") ||\n    elements.has("RevenueIFRSKeyFinancialData") ||\n    elements.has("RevenueIFRSSummaryOfBusinessResults") ||\n    elements.has("Revenue2IFRS") ||\n    elements.has("RevenueIFRS") ||\n    elements.has("OperatingProfitLossIFRS")\n  ) {`,
  "XBRL IFRS profile markers"
);

const repairPath = "scripts/repair-market-ranking-data.ts";
replaceOnce(
  repairPath,
  `function finite(value: unknown): value is number {\n  return typeof value === "number" && Number.isFinite(value);\n}\n`,
  `function finite(value: unknown): value is number {\n  return typeof value === "number" && Number.isFinite(value);\n}\n\nfunction firstFinite(...values: unknown[]) {\n  for (const value of values) {\n    if (finite(value)) return value;\n  }\n  return null;\n}\n\nfunction mergedCurrentFacts(\n  extracted: Partial<FinancialFacts>,\n  stored: Record<string, unknown>\n): FinancialFacts {\n  return {\n    revenue: firstFinite(extracted.revenue, stored.revenue),\n    grossProfit: firstFinite(extracted.grossProfit, stored.grossProfit),\n    netIncome: firstFinite(extracted.netIncome, stored.netIncome),\n    operatingIncome: firstFinite(\n      extracted.operatingIncome,\n      stored.operatingIncome\n    ),\n    operatingCF: firstFinite(extracted.operatingCF, stored.operatingCF),\n    cash: firstFinite(extracted.cash, stored.cash, stored.cashAndDeposits),\n    currentLiabilities: firstFinite(\n      extracted.currentLiabilities,\n      stored.currentLiabilities\n    ),\n    assets: firstFinite(extracted.assets, stored.assets),\n    netAssets: firstFinite(\n      extracted.netAssets,\n      stored.netAssets,\n      stored.equityAmount\n    ),\n  };\n}\n\nfunction mergedPriorFacts(\n  extracted: Partial<FinancialFacts>,\n  history: HistoryRow[] | null\n): FinancialFacts {\n  const rows = Array.isArray(history)\n    ? [...history].sort((left, right) => historyKey(left).localeCompare(historyKey(right)))\n    : [];\n  const prior = rows.at(-2) ?? {};\n\n  return {\n    revenue: firstFinite(extracted.revenue, prior.revenue),\n    grossProfit: firstFinite(extracted.grossProfit, prior.grossProfit),\n    netIncome: firstFinite(extracted.netIncome, prior.netIncome),\n    operatingIncome: firstFinite(\n      extracted.operatingIncome,\n      prior.operatingIncome\n    ),\n    operatingCF: firstFinite(extracted.operatingCF, prior.operatingCF),\n    cash: null,\n    currentLiabilities: null,\n    assets: null,\n    netAssets: null,\n  };\n}\n`,
  "ranking repair fact mergers"
);

replaceOnce(
  repairPath,
  `  return (\n    !finite(financials.grossProfit) ||\n    !finite(financials.netIncome) ||\n    !finite(financials.grossMargin) ||\n    !finite(financials.netMargin) ||\n    grossHistoryCount < 2 ||\n    netHistoryCount < 2\n  );`,
  `  const grossMargin = finite(financials.grossMargin)\n    ? financials.grossMargin\n    : null;\n  const netMargin = finite(financials.netMargin)\n    ? financials.netMargin\n    : null;\n  const needsIfrsCorrection =\n    financials.financialProfile === "ifrs" &&\n    financials.marketRankingMetricsVersion !== 2;\n\n  return (\n    needsIfrsCorrection ||\n    !finite(financials.grossProfit) ||\n    !finite(financials.netIncome) ||\n    grossMargin === null ||\n    netMargin === null ||\n    grossMargin > 105 ||\n    netMargin > 300 ||\n    grossHistoryCount < 2 ||\n    netHistoryCount < 2\n  );`,
  "ranking repair target quality"
);

replaceOnce(
  repairPath,
  `  for (let attempt = 1; attempt <= 3; attempt += 1) {\n    try {\n      const response = await fetch(url, { cache: "no-store" });\n      if (!response.ok) {\n        throw new Error(\`EDINET CSV fetch failed: \${docID} \${response.status}\`);\n      }\n      return Buffer.from(await response.arrayBuffer());\n    } catch (error) {\n      lastError = error;\n      if (attempt < 3) {\n        await new Promise((resolve) => setTimeout(resolve, attempt * 750));\n      }\n    }\n  }`,
  `  for (let attempt = 1; attempt <= 5; attempt += 1) {\n    try {\n      const response = await fetch(url, { cache: "no-store" });\n      if (!response.ok) {\n        throw new Error(\`EDINET CSV fetch failed: \${docID} \${response.status}\`);\n      }\n\n      const buffer = Buffer.from(await response.arrayBuffer());\n      if (buffer.length < 4 || buffer.subarray(0, 2).toString() !== "PK") {\n        throw new Error(\n          \`EDINET CSV response is not ZIP: \${docID}, content-type=\${response.headers.get("content-type")}, bytes=\${buffer.length}\`\n        );\n      }\n      return buffer;\n    } catch (error) {\n      lastError = error;\n      if (attempt < 5) {\n        const delay = attempt * 1500 + Math.floor(Math.random() * 500);\n        await new Promise((resolve) => setTimeout(resolve, delay));\n      }\n    }\n  }`,
  "EDINET ZIP retry"
);

replaceOnce(
  repairPath,
  `    if (!hasRankingFacts(extracted.current, extracted.prior)) {`,
  `    const current = mergedCurrentFacts(\n      extracted.current,\n      analysis.financials ?? {}\n    );\n    const prior = mergedPriorFacts(extracted.prior, analysis.history);\n\n    if (!hasRankingFacts(current, prior)) {`,
  "merge extracted and stored facts"
);

replaceOnce(
  repairPath,
  `    const metrics = calculateFinancialMetrics(extracted.current, extracted.prior);\n    const financials = {\n      ...(analysis.financials ?? {}),\n      ...extracted.metadata,\n      ...metrics,\n    };\n    const history = mergeHistory(\n      analysis.history,\n      extracted.current,\n      extracted.prior\n    );`,
  `    const metrics = calculateFinancialMetrics(current, prior);\n    const financials = {\n      ...(analysis.financials ?? {}),\n      ...extracted.metadata,\n      ...metrics,\n      marketRankingMetricsVersion: 2,\n    };\n    const history = mergeHistory(analysis.history, current, prior);`,
  "save corrected ranking facts"
);

replaceOnce(
  repairPath,
  `  const concurrency = Math.min(12, parsePositiveInteger("concurrency", 8));`,
  `  const concurrency = Math.min(8, parsePositiveInteger("concurrency", 4));`,
  "reduce EDINET concurrency"
);

console.log("Market ranking quality patch applied");
