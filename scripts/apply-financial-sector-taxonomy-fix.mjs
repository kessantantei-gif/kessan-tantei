import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count < 1) {
    throw new Error(`${label}: pattern not found`);
  }
  if (count > 1) {
    console.log(`${label}: using the first of ${count} matches`);
  }
  return source.replace(before, after);
}

function replaceRegex(source, pattern, after, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`${label}: pattern not found`);
  return source.replace(pattern, after);
}

const profileUnionBefore = `  | "special-finance"\n  | "commodity";`;
const profileUnionAfter = `  | "special-finance"\n  | "commodity"\n  | "ifrs"\n  | "insurance-ifrs"\n  | "operating-revenue";`;

const xbrlNewProfiles = `  ifrs: {
    revenueElements: [
      "RevenueIFRSSummaryOfBusinessResults",
      "Revenue2IFRS",
      "RevenueIFRS",
      "RevenueFromExternalCustomers2IFRS",
      "OperatingRevenueIFRS",
    ],
    operatingIncomeElements: [
      "OperatingProfitLossIFRSKeyFinancialData",
      "OperatingProfitLossIFRS",
      "OperatingProfitIFRS",
      "OperatingIncomeLossUSGAAPSummaryOfBusinessResults",
    ],
    cashElements: [
      "CashAndCashEquivalentsIFRS",
      "CashAndCashEquivalents",
      "CashAndDeposits",
    ],
    revenueLabel: "売上収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
  },
  "insurance-ifrs": {
    revenueElements: [
      "Revenue2IFRS",
      "InsuranceRevenueIFRSKeyFinancialData",
      "InsuranceRevenueIFRS",
      "RevenueIFRSSummaryOfBusinessResults",
    ],
    operatingIncomeElements: [
      "ProfitLossBeforeTaxIFRSSummaryOfBusinessResults",
      "ProfitLossBeforeTaxIFRS",
    ],
    cashElements: [
      "CashAndCashEquivalentsIFRS",
      "CashAndCashEquivalents",
      "CashAndDepositsAssetsINS",
      "CashAndDeposits",
    ],
    revenueLabel: "収益",
    operatingIncomeLabel: "税引前利益",
    currentRatioApplicable: false,
  },
  "operating-revenue": {
    revenueElements: [
      "OperatingRevenue1SummaryOfBusinessResults",
      "OperatingRevenue1",
      "OperatingRevenueIVT",
      "OperatingRevenues",
      "OperatingRevenue",
    ],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingIncomeLoss",
      "OrdinaryIncomeLossSummaryOfBusinessResults",
      "OrdinaryIncome",
    ],
    cashElements: ["CashAndCashEquivalents", "CashAndDeposits"],
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
  },
`;

let xbrl = read("lib/edinet-parser.ts");
xbrl = replaceOnce(xbrl, profileUnionBefore, profileUnionAfter, "xbrl profile union");
xbrl = replaceOnce(xbrl, `  bank: {`, `${xbrlNewProfiles}  bank: {`, "xbrl profile definitions");
xbrl = replaceOnce(
  xbrl,
  `    operatingIncomeElements: ["OrdinaryIncome", "ProfitLoss"],`,
  `    operatingIncomeElements: [\n      "OrdinaryIncomeLossSummaryOfBusinessResults",\n      "OrdinaryIncome",\n      "ProfitLoss",\n    ],`,
  "xbrl bank profit tags"
);
xbrl = replaceOnce(
  xbrl,
  `    revenueElements: ["OperatingIncomeINS", "OperatingRevenueINS", "Revenue"],`,
  `    revenueElements: [\n      "OrdinaryIncomeSummaryOfBusinessResults",\n      "OperatingIncomeINS",\n      "OperatingRevenueINS",\n      "Revenue",\n    ],`,
  "xbrl insurance revenue tags"
);
xbrl = replaceOnce(
  xbrl,
  `    operatingIncomeElements: ["OrdinaryIncome", "ProfitLoss"],`,
  `    operatingIncomeElements: [\n      "OrdinaryIncomeLossSummaryOfBusinessResults",\n      "OrdinaryIncome",\n      "ProfitLoss",\n    ],`,
  "xbrl insurance profit tags"
);
xbrl = replaceOnce(
  xbrl,
  `    operatingCF: extractFact(facts, contexts, durationContext, [\n      "NetCashProvidedByUsedInOperatingActivities",\n      "CashFlowsFromUsedInOperatingActivities",\n      "NetCashProvidedByOperatingActivities",\n    ]),`,
  `    operatingCF: extractFact(facts, contexts, durationContext, [\n      "CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults",\n      "NetCashProvidedByUsedInOperatingActivitiesIFRS",\n      "NetCashProvidedByUsedInOperatingActivities",\n      "CashFlowsFromUsedInOperatingActivities",\n      "NetCashProvidedByOperatingActivities",\n    ]),`,
  "xbrl operating cash flow tags"
);
xbrl = replaceOnce(
  xbrl,
  `    assets: extractFact(facts, contexts, instantContext, ["Assets", "TotalAssets"]),`,
  `    assets: extractFact(facts, contexts, instantContext, [\n      "TotalAssetsSummaryOfBusinessResults",\n      "AssetsIFRS",\n      "TotalAssetsIFRS",\n      "Assets",\n      "TotalAssets",\n    ]),`,
  "xbrl asset tags"
);
xbrl = replaceOnce(
  xbrl,
  `      "EquityAttributableToOwnersOfParent",\n    ]),`,
  `      "EquityAttributableToOwnersOfParent",\n      "EquityAttributableToOwnersOfParentIFRS",\n      "EquityIFRS",\n      "TotalEquityIFRS",\n    ]),`,
  "xbrl equity tags"
);
xbrl = replaceRegex(
  xbrl,
  /function detectFinancialProfile\(facts: NumericFact\[\]\): FinancialMetricProfile \{[\s\S]*?\n\}/,
  `function detectFinancialProfile(facts: NumericFact[]): FinancialMetricProfile {
  const elements = new Set(facts.map((fact) => localName(fact.name)));

  if (
    elements.has("OrdinaryIncomeBNK") ||
    elements.has("CashAndDueFromBanksAssetsBNK")
  ) {
    return "bank";
  }

  const insuranceMarkers = [
    "OperatingIncomeINS",
    "CashAndDepositsAssetsINS",
    "InsuranceRevenueIFRSKeyFinancialData",
    "InsuranceRevenueIFRS",
    "NetPremiumsWrittenSummaryOfBusinessResultsINS",
  ];
  if (insuranceMarkers.some((element) => elements.has(element))) {
    return elements.has("OrdinaryIncomeSummaryOfBusinessResults")
      ? "insurance"
      : "insurance-ifrs";
  }

  if (
    elements.has("OperatingRevenueSEC") ||
    elements.has("NetOperatingRevenueSEC")
  ) {
    return "securities";
  }
  if (elements.has("OperatingRevenueSPF")) return "special-finance";
  if (elements.has("OperatingRevenueCMD")) return "commodity";

  if (
    elements.has("RevenueIFRSSummaryOfBusinessResults") ||
    elements.has("Revenue2IFRS") ||
    elements.has("RevenueIFRS") ||
    elements.has("OperatingProfitLossIFRS")
  ) {
    return "ifrs";
  }

  if (
    elements.has("OperatingRevenue1SummaryOfBusinessResults") ||
    elements.has("OperatingRevenue1") ||
    elements.has("OperatingRevenueIVT") ||
    elements.has("OperatingRevenues")
  ) {
    return "operating-revenue";
  }

  return "general";
}`,
  "xbrl profile detection"
);
write("lib/edinet-parser.ts", xbrl);

const csvNewProfiles = `  ifrs: {
    financialProfile: "ifrs",
    revenueLabel: "売上収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
    revenueElements: [
      "RevenueIFRSSummaryOfBusinessResults",
      "Revenue2IFRS",
      "RevenueIFRS",
      "RevenueFromExternalCustomers2IFRS",
      "OperatingRevenueIFRS",
    ],
    revenueLabels: ["売上収益（IFRS）、経営指標等", "売上収益（IFRS）", "収益（IFRS）"],
    operatingIncomeElements: [
      "OperatingProfitLossIFRSKeyFinancialData",
      "OperatingProfitLossIFRS",
      "OperatingProfitIFRS",
      "OperatingIncomeLossUSGAAPSummaryOfBusinessResults",
    ],
    operatingIncomeLabels: ["営業利益（△損失）（IFRS）", "営業利益（IFRS）"],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalentsIFRS",
      "CashAndCashEquivalents",
      "CashAndDeposits",
    ],
    cashLabels: ["現金及び現金同等物の残高、経営指標等", "現金及び現金同等物"],
  },
  "insurance-ifrs": {
    financialProfile: "insurance-ifrs",
    revenueLabel: "収益",
    operatingIncomeLabel: "税引前利益",
    currentRatioApplicable: false,
    revenueElements: [
      "Revenue2IFRS",
      "InsuranceRevenueIFRSKeyFinancialData",
      "InsuranceRevenueIFRS",
      "RevenueIFRSSummaryOfBusinessResults",
    ],
    revenueLabels: ["収益（IFRS）", "保険収益"],
    operatingIncomeElements: [
      "ProfitLossBeforeTaxIFRSSummaryOfBusinessResults",
      "ProfitLossBeforeTaxIFRS",
    ],
    operatingIncomeLabels: ["税引前利益又は税引前損失", "税引前利益"],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalentsIFRS",
      "CashAndCashEquivalents",
      "CashAndDepositsAssetsINS",
      "CashAndDeposits",
    ],
    cashLabels: ["現金及び現金同等物の残高、経営指標等", "現金及び現金同等物", "現金及び預貯金"],
  },
  "operating-revenue": {
    financialProfile: "operating-revenue",
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
    revenueElements: [
      "OperatingRevenue1SummaryOfBusinessResults",
      "OperatingRevenue1",
      "OperatingRevenueIVT",
      "OperatingRevenues",
      "OperatingRevenue",
    ],
    revenueLabels: ["営業収益、経営指標等", "営業収益"],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingIncomeLoss",
      "OrdinaryIncomeLossSummaryOfBusinessResults",
      "OrdinaryIncome",
    ],
    operatingIncomeLabels: ["営業利益又は営業損失", "営業利益", "営業損失"],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalents",
      "CashAndDeposits",
    ],
    cashLabels: ["現金及び現金同等物の残高、経営指標等", "現金及び現金同等物の残高", "現金及び預金"],
  },
`;

let csv = read("lib/edinet-financial-parser.ts");
csv = replaceOnce(csv, profileUnionBefore, profileUnionAfter, "csv profile union");
csv = replaceOnce(csv, `  bank: {`, `${csvNewProfiles}  bank: {`, "csv profile definitions");
csv = replaceOnce(
  csv,
  `    operatingIncomeElements: ["OrdinaryIncome", "OrdinaryProfitLoss"],`,
  `    operatingIncomeElements: [\n      "OrdinaryIncomeLossSummaryOfBusinessResults",\n      "OrdinaryIncome",\n      "OrdinaryProfitLoss",\n    ],`,
  "csv bank profit tags"
);
csv = replaceOnce(
  csv,
  `    revenueElements: [\n      "OperatingIncomeINS",\n      "OrdinaryIncomeSummaryOfBusinessResults",\n      "OperatingRevenueINS",\n    ],`,
  `    revenueElements: [\n      "OrdinaryIncomeSummaryOfBusinessResults",\n      "OperatingIncomeINS",\n      "OperatingRevenueINS",\n    ],`,
  "csv insurance revenue priority"
);
csv = replaceOnce(
  csv,
  `    operatingIncomeElements: ["OrdinaryIncome", "OrdinaryProfitLoss"],`,
  `    operatingIncomeElements: [\n      "OrdinaryIncomeLossSummaryOfBusinessResults",\n      "OrdinaryIncome",\n      "OrdinaryProfitLoss",\n    ],`,
  "csv insurance profit tags"
);
csv = replaceRegex(
  csv,
  /function detectFinancialProfile\(rows: Row\[\]\): FinancialMetricProfile \{[\s\S]*?\n\}/,
  `function detectFinancialProfile(rows: Row[]): FinancialMetricProfile {
  const elements = new Set(rows.map((row) => localElement(row)));

  if (
    elements.has("OrdinaryIncomeBNK") ||
    elements.has("CashAndDueFromBanksAssetsBNK")
  ) {
    return "bank";
  }

  const insuranceMarkers = [
    "OperatingIncomeINS",
    "CashAndDepositsAssetsINS",
    "InsuranceRevenueIFRSKeyFinancialData",
    "InsuranceRevenueIFRS",
    "NetPremiumsWrittenSummaryOfBusinessResultsINS",
  ];
  if (insuranceMarkers.some((element) => elements.has(element))) {
    return elements.has("OrdinaryIncomeSummaryOfBusinessResults")
      ? "insurance"
      : "insurance-ifrs";
  }

  if (
    elements.has("OperatingRevenueSEC") ||
    elements.has("NetOperatingRevenueSEC")
  ) {
    return "securities";
  }
  if (elements.has("OperatingRevenueSPF")) return "special-finance";
  if (elements.has("OperatingRevenueCMD")) return "commodity";

  if (
    elements.has("RevenueIFRSSummaryOfBusinessResults") ||
    elements.has("Revenue2IFRS") ||
    elements.has("RevenueIFRS") ||
    elements.has("OperatingProfitLossIFRS")
  ) {
    return "ifrs";
  }

  if (
    elements.has("OperatingRevenue1SummaryOfBusinessResults") ||
    elements.has("OperatingRevenue1") ||
    elements.has("OperatingRevenueIVT") ||
    elements.has("OperatingRevenues")
  ) {
    return "operating-revenue";
  }

  return "general";
}`,
  "csv profile detection"
);
csv = replaceOnce(
  csv,
  `  const operatingCFElements = [\n    "NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults",\n    "NetCashProvidedByUsedInOperatingActivities",`,
  `  const operatingCFElements = [\n    "CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults",\n    "NetCashProvidedByUsedInOperatingActivitiesIFRS",\n    "NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults",\n    "NetCashProvidedByUsedInOperatingActivities",`,
  "csv IFRS operating cash flow tags"
);
csv = replaceOnce(
  csv,
  `      "AssetsIFRS",\n    ],`,
  `      "AssetsIFRS",\n      "TotalAssetsIFRS",\n    ],`,
  "csv asset tags"
);
csv = replaceOnce(
  csv,
  `      "EquityAttributableToOwnersOfParent",\n    ],`,
  `      "EquityAttributableToOwnersOfParent",\n      "EquityAttributableToOwnersOfParentIFRS",\n      "EquityIFRS",\n      "TotalEquityIFRS",\n    ],`,
  "csv equity tags"
);
write("lib/edinet-financial-parser.ts", csv);

let reprocess = read("scripts/reprocess-financial-sector-data.ts");
reprocess = replaceOnce(
  reprocess,
  `type StoredFinancials = {\n  financialProfile?: string;`,
  `type StoredFinancials = {\n  revenue?: number | null;\n  financialProfile?: string;`,
  "reprocess revenue type"
);
reprocess = replaceOnce(
  reprocess,
  `  history: Array<{ docID?: string }> | null;`,
  `  history: Array<{\n    docID?: string;\n    periodEnd?: string;\n    fiscalYear?: number | string;\n    year?: number | string;\n  }> | null;`,
  "reprocess history type"
);
reprocess = replaceOnce(
  reprocess,
  `function alreadyUsesFinancialMetadata(financials: StoredFinancials | null) {`,
  `function latestHistoryDocument(history: AnalysisRow["history"]) {\n  if (!Array.isArray(history)) return null;\n  return [...history]\n    .filter((row) => typeof row.docID === "string" && /^S100[A-Z0-9]+$/.test(row.docID))\n    .sort((left, right) => {\n      const leftKey = left.periodEnd ?? String(left.fiscalYear ?? left.year ?? "");\n      const rightKey = right.periodEnd ?? String(right.fiscalYear ?? right.year ?? "");\n      return leftKey.localeCompare(rightKey);\n    })\n    .at(-1)?.docID ?? null;\n}\n\nfunction alreadyUsesFinancialMetadata(financials: StoredFinancials | null) {`,
  "reprocess latest document helper"
);
reprocess = replaceOnce(
  reprocess,
  `      if (!force && alreadyUsesFinancialMetadata(analysis.financials)) {\n        alreadyUpdated += 1;\n        return null;\n      }\n\n      const historyDocIDs = Array.from(\n        new Set([\n          analysis.doc_id,`,
  `      const latestDocID = latestHistoryDocument(analysis.history) ?? analysis.doc_id;\n      const revenue = analysis.financials?.revenue;\n      const revenueIsValid =\n        typeof revenue === "number" && Number.isFinite(revenue) && revenue > 0;\n      const isCurrentDocument = latestDocID === analysis.doc_id;\n\n      if (\n        !force &&\n        alreadyUsesFinancialMetadata(analysis.financials) &&\n        revenueIsValid &&\n        isCurrentDocument\n      ) {\n        alreadyUpdated += 1;\n        return null;\n      }\n\n      const historyDocIDs = Array.from(\n        new Set([\n          latestDocID,\n          analysis.doc_id,`,
  "reprocess skip logic"
);
reprocess = replaceOnce(
  reprocess,
  `        docID: analysis.doc_id,`,
  `        docID: latestDocID,`,
  "reprocess latest target doc"
);
write("scripts/reprocess-financial-sector-data.ts", reprocess);

let audit = read("scripts/audit-financial-sector-data.ts");
audit = replaceOnce(
  audit,
  `  "commodity",\n]);`,
  `  "commodity",\n  "ifrs",\n  "insurance-ifrs",\n  "operating-revenue",\n]);`,
  "audit known profiles"
);
audit = replaceOnce(
  audit,
  `  if (!analysis) {\n    add("analysis", "company_analyses に分析データがありません");\n    return issues;\n  }\n  if (!analysis.doc_id) add("doc_id", "最新のEDINET書類IDがありません");`,
  `  if (!analysis?.doc_id) return issues;`,
  "audit unavailable companies"
);
audit = replaceOnce(
  audit,
  `  if (profile === "bank" || profile === "insurance") {`,
  `  if (profile === "bank" || profile === "insurance") {`,
  "audit bank insurance anchor"
);
audit = replaceOnce(
  audit,
  `  if (\n    profile === "securities" ||\n    profile === "special-finance" ||\n    profile === "commodity"\n  ) {`,
  `  if (profile === "insurance-ifrs") {\n    if (financials.revenueLabel !== "収益") {\n      add("revenueLabel", "insurance-ifrs は「収益」で表示する必要があります");\n    }\n    if (financials.operatingIncomeLabel !== "税引前利益") {\n      add("operatingIncomeLabel", "insurance-ifrs は「税引前利益」で表示する必要があります");\n    }\n    if (financials.currentRatioApplicable !== false) {\n      add("currentRatioApplicable", "insurance-ifrs に一般会社の流動比率を適用しています");\n    }\n  }\n\n  if (profile === "ifrs") {\n    if (financials.revenueLabel !== "売上収益") {\n      add("revenueLabel", "ifrs は「売上収益」で表示する必要があります");\n    }\n    if (financials.operatingIncomeLabel !== "営業利益") {\n      add("operatingIncomeLabel", "ifrs は「営業利益」で表示する必要があります");\n    }\n  }\n\n  if (\n    profile === "securities" ||\n    profile === "special-finance" ||\n    profile === "commodity" ||\n    profile === "operating-revenue"\n  ) {`,
  "audit new profile rules"
);
audit = replaceOnce(
  audit,
  `  const issues = companies.flatMap((company) =>\n    auditCompany(company, analysisByTicker.get(company.ticker))\n  );`,
  `  const unavailableCompanies = companies\n    .filter((company) => !analysisByTicker.get(company.ticker)?.doc_id)\n    .map((company) => company.ticker);\n  const auditableCompanies = companies.filter(\n    (company) => analysisByTicker.get(company.ticker)?.doc_id\n  );\n  const issues = auditableCompanies.flatMap((company) =>\n    auditCompany(company, analysisByTicker.get(company.ticker))\n  );`,
  "audit auditable set"
);
audit = replaceOnce(
  audit,
  `    listedFinancialCompanies: companies.length,\n    cleanCompanies: companies.length - flaggedCompanies,`,
  `    listedFinancialCompanies: companies.length,\n    auditedCompanies: auditableCompanies.length,\n    unavailableCompanies,\n    cleanCompanies: auditableCompanies.length - flaggedCompanies,`,
  "audit summary"
);
write("scripts/audit-financial-sector-data.ts", audit);

write(
  "scripts/check-financial-sector-parser.ts",
  `import { parseEdinetFinancialsFromXbrl } from "../lib/edinet-parser";\n\nfunction xbrl(facts: string) {\n  return \`\n<xbrli:context id="CurrentYearConsolidatedDuration">\n  <xbrli:entity><xbrli:segment><xbrldi:explicitMember>ConsolidatedMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity>\n  <xbrli:period><xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period>\n</xbrli:context>\n<xbrli:context id="CurrentYearConsolidatedInstant">\n  <xbrli:entity><xbrli:segment><xbrldi:explicitMember>ConsolidatedMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity>\n  <xbrli:period><xbrli:instant>2026-03-31</xbrli:instant></xbrli:period>\n</xbrli:context>\n\${facts}\`;\n}\n\nfunction assert(condition: boolean, message: string) {\n  if (!condition) throw new Error(message);\n}\n\nconst bank = parseEdinetFinancialsFromXbrl(xbrl(\`\n<jppfs_cor:OrdinaryIncomeBNK contextRef="CurrentYearConsolidatedDuration">1200</jppfs_cor:OrdinaryIncomeBNK>\n<jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">180</jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults>\n<jppfs_cor:CashAndDueFromBanksAssetsBNK contextRef="CurrentYearConsolidatedInstant">300</jppfs_cor:CashAndDueFromBanksAssetsBNK>\n<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">5000</jppfs_cor:Assets>\n<jppfs_cor:NetAssets contextRef="CurrentYearConsolidatedInstant">600</jppfs_cor:NetAssets>\n\`));\nassert(bank.financialProfile === "bank", "銀行業プロファイルを判定できません");\nassert(bank.revenue === 1200 && bank.operatingIncome === 180, "銀行業の経常収益・経常利益を取得できません");\nassert(bank.currentRatioApplicable === false, "銀行業へ流動比率を適用しています");\n\nconst insurance = parseEdinetFinancialsFromXbrl(xbrl(\`\n<jpcrp_cor:OrdinaryIncomeSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">2200</jpcrp_cor:OrdinaryIncomeSummaryOfBusinessResults>\n<jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">200</jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults>\n<example:InsuranceRevenueIFRS contextRef="CurrentYearConsolidatedDuration">1900</example:InsuranceRevenueIFRS>\n<jppfs_cor:CashAndDepositsAssetsINS contextRef="CurrentYearConsolidatedInstant">350</jppfs_cor:CashAndDepositsAssetsINS>\n<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">7000</jppfs_cor:Assets>\n\`));\nassert(insurance.financialProfile === "insurance", "保険業プロファイルを判定できません");\nassert(insurance.revenue === 2200 && insurance.operatingIncome === 200, "保険業の経常収益・経常利益を取得できません");\n\nconst insuranceIfrs = parseEdinetFinancialsFromXbrl(xbrl(\`\n<example:InsuranceRevenueIFRS contextRef="CurrentYearConsolidatedDuration">5200</example:InsuranceRevenueIFRS>\n<jpigp_cor:Revenue2IFRS contextRef="CurrentYearConsolidatedDuration">5600</jpigp_cor:Revenue2IFRS>\n<jpcrp_cor:ProfitLossBeforeTaxIFRSSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">800</jpcrp_cor:ProfitLossBeforeTaxIFRSSummaryOfBusinessResults>\n<jpigp_cor:CashAndCashEquivalentsIFRS contextRef="CurrentYearConsolidatedInstant">400</jpigp_cor:CashAndCashEquivalentsIFRS>\n<jpigp_cor:AssetsIFRS contextRef="CurrentYearConsolidatedInstant">9000</jpigp_cor:AssetsIFRS>\n\`));\nassert(insuranceIfrs.financialProfile === "insurance-ifrs", "IFRS保険業プロファイルを判定できません");\nassert(insuranceIfrs.revenue === 5600 && insuranceIfrs.operatingIncome === 800, "IFRS保険業の収益・税引前利益を取得できません");\n\nconst securities = parseEdinetFinancialsFromXbrl(xbrl(\`\n<jppfs_cor:OperatingRevenueSEC contextRef="CurrentYearConsolidatedDuration">900</jppfs_cor:OperatingRevenueSEC>\n<jppfs_cor:OperatingIncome contextRef="CurrentYearConsolidatedDuration">90</jppfs_cor:OperatingIncome>\n<jppfs_cor:CurrentAssets contextRef="CurrentYearConsolidatedInstant">1000</jppfs_cor:CurrentAssets>\n\`));\nassert(securities.financialProfile === "securities" && securities.revenue === 900, "証券業の営業収益を取得できません");\n\nconst ifrs = parseEdinetFinancialsFromXbrl(xbrl(\`\n<jpcrp_cor:RevenueIFRSSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">3000</jpcrp_cor:RevenueIFRSSummaryOfBusinessResults>\n<jpigp_cor:OperatingProfitLossIFRS contextRef="CurrentYearConsolidatedDuration">500</jpigp_cor:OperatingProfitLossIFRS>\n<jpcrp_cor:CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">450</jpcrp_cor:CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults>\n<jpigp_cor:AssetsIFRS contextRef="CurrentYearConsolidatedInstant">8000</jpigp_cor:AssetsIFRS>\n\`));\nassert(ifrs.financialProfile === "ifrs", "IFRSプロファイルを判定できません");\nassert(ifrs.revenue === 3000 && ifrs.operatingIncome === 500 && ifrs.operatingCF === 450, "IFRSの売上収益・営業利益・営業CFを取得できません");\n\nconst operatingRevenue = parseEdinetFinancialsFromXbrl(xbrl(\`\n<jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">1500</jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults>\n<jppfs_cor:OperatingIncome contextRef="CurrentYearConsolidatedDuration">240</jppfs_cor:OperatingIncome>\n<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">4000</jppfs_cor:Assets>\n\`));\nassert(operatingRevenue.financialProfile === "operating-revenue", "営業収益型プロファイルを判定できません");\nassert(operatingRevenue.revenue === 1500 && operatingRevenue.operatingIncome === 240, "営業収益型企業の数値を取得できません");\n\nconsole.log("金融業EDINETパーサー検証: OK");\n`
);

console.log("金融業タクソノミ修正を適用しました");
