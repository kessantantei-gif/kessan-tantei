import fs from "node:fs";

const path = "scripts/sync-tdnet-quarterly.ts";
let source = fs.readFileSync(path, "utf8");

const beforeFindFact = `function findFact(facts: Fact[], names: RegExp[], preferredContexts: RegExp[] = []) {
  const candidates = facts.filter((fact) => names.some((pattern) => pattern.test(fact.name)));
  const preferred = candidates.find((fact) =>
    preferredContexts.some((pattern) => pattern.test(fact.contextRef ?? ""))
  );
  return parseNumeric((preferred ?? candidates[0])?.value ?? "");
}`;

const afterFindFact = `function findFact(facts: Fact[], names: RegExp[], preferredContexts: RegExp[] = []) {
  const candidates = facts.filter((fact) => names.some((pattern) => pattern.test(fact.name)));
  const preferred = candidates.filter((fact) =>
    preferredContexts.some((pattern) => pattern.test(fact.contextRef ?? ""))
  );
  const ordered = [...preferred, ...candidates.filter((fact) => !preferred.includes(fact))];

  for (const fact of ordered) {
    const numeric = parseNumeric(fact.value);
    if (numeric !== null) return numeric;
  }
  return null;
}`;

if (source.includes(beforeFindFact)) {
  source = source.replace(beforeFindFact, afterFindFact);
} else if (!source.includes(afterFindFact)) {
  throw new Error("findFact関数の置換対象が見つかりません");
}

const originalRevenue = `revenue: findFact(facts, [/Revenue/i, /NetSales/i, /OperatingRevenue/i], currentContexts),`;
const expandedRevenue = `revenue: findFact(
      facts,
      [/Revenue/i, /NetSales/i, /OperatingRevenue/i, /SalesRevenue/i, /TotalRevenue/i],
      currentContexts
    ),`;
const finalRevenue = `revenue: findFact(
      facts,
      [
        /^Sales(?:IFRS)?$/i,
        /Revenue/i,
        /NetSales/i,
        /OperatingRevenue/i,
        /SalesRevenue/i,
        /TotalRevenue/i,
      ],
      currentContexts
    ),`;

if (source.includes(originalRevenue)) {
  source = source.replace(originalRevenue, finalRevenue);
} else if (source.includes(expandedRevenue)) {
  source = source.replace(expandedRevenue, finalRevenue);
} else if (!source.includes(finalRevenue)) {
  throw new Error("売上収益概念の置換対象が見つかりません");
}

source = source.replace(
  `operatingCF: findFact(facts, [/NetCashProvidedByUsedInOperatingActivities/i], currentContexts),`,
  `operatingCF: findFact(
      facts,
      [/NetCashProvidedByUsedInOperatingActivities/i, /CashFlows?FromUsedInOperatingActivities/i],
      currentContexts
    ),`
);
source = source.replace(
  `investingCF: findFact(facts, [/NetCashProvidedByUsedInInvestingActivities/i], currentContexts),`,
  `investingCF: findFact(
      facts,
      [/NetCashProvidedByUsedInInvestingActivities/i, /CashFlows?FromUsedInInvestingActivities/i],
      currentContexts
    ),`
);
source = source.replace(
  `financingCF: findFact(facts, [/NetCashProvidedByUsedInFinancingActivities/i], currentContexts),`,
  `financingCF: findFact(
      facts,
      [/NetCashProvidedByUsedInFinancingActivities/i, /CashFlows?FromUsedInFinancingActivities/i],
      currentContexts
    ),`
);

fs.writeFileSync(path, source);
console.log("四半期数値は数値化できるfactを優先し、SalesIFRSを含む売上・CF概念を拡張しました");
