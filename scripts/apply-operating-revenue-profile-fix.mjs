import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

const csvPath = "lib/edinet-financial-parser.ts";
replaceOnce(
  csvPath,
  `    revenueElements: [\n      "OperatingRevenue1SummaryOfBusinessResults",\n      "OperatingRevenue1",\n      "OperatingRevenueIVT",\n      "OperatingRevenues",\n      "OperatingRevenue",\n      "NetSalesSummaryOfBusinessResults",\n      "RevenueSummaryOfBusinessResults",\n      "NetSales",\n      "Revenue",\n    ],`,
  `    revenueElements: [\n      "OperatingRevenue1SummaryOfBusinessResults",\n      "OperatingRevenueSummaryOfBusinessResults",\n      "NetSalesSummaryOfBusinessResults",\n      "RevenueSummaryOfBusinessResults",\n      "OperatingRevenue1",\n      "OperatingRevenueIVT",\n      "OperatingRevenues",\n      "OperatingRevenue",\n      "NetSales",\n      "Revenue",\n    ],`,
  "CSV operating revenue priority"
);

replaceOnce(
  csvPath,
  `  if (\n    elements.has("OperatingRevenue1SummaryOfBusinessResults") ||\n    elements.has("OperatingRevenue1") ||\n    elements.has("OperatingRevenueIVT") ||\n    elements.has("OperatingRevenues")\n  ) {\n    return "operating-revenue";\n  }`,
  `  const hasConsolidatedNetSalesSummary = rows.some(\n    (row) =>\n      localElement(row) === "NetSalesSummaryOfBusinessResults" &&\n      !context(row).includes("NonConsolidatedMember")\n  );\n\n  if (\n    !hasConsolidatedNetSalesSummary &&\n    (elements.has("OperatingRevenue1SummaryOfBusinessResults") ||\n      elements.has("OperatingRevenue1") ||\n      elements.has("OperatingRevenueIVT") ||\n      elements.has("OperatingRevenues"))\n  ) {\n    return "operating-revenue";\n  }`,
  "CSV operating revenue profile detection"
);

const xbrlPath = "lib/edinet-parser.ts";
replaceOnce(
  xbrlPath,
  `    revenueElements: [\n      "OperatingRevenue1SummaryOfBusinessResults",\n      "OperatingRevenue1",\n      "OperatingRevenueIVT",\n      "OperatingRevenues",\n      "OperatingRevenue",\n      "NetSalesSummaryOfBusinessResults",\n      "RevenueSummaryOfBusinessResults",\n      "NetSales",\n      "Revenue",\n    ],`,
  `    revenueElements: [\n      "OperatingRevenue1SummaryOfBusinessResults",\n      "OperatingRevenueSummaryOfBusinessResults",\n      "NetSalesSummaryOfBusinessResults",\n      "RevenueSummaryOfBusinessResults",\n      "OperatingRevenue1",\n      "OperatingRevenueIVT",\n      "OperatingRevenues",\n      "OperatingRevenue",\n      "NetSales",\n      "Revenue",\n    ],`,
  "XBRL operating revenue priority"
);

replaceOnce(
  xbrlPath,
  `  if (\n    elements.has("OperatingRevenue1SummaryOfBusinessResults") ||\n    elements.has("OperatingRevenue1") ||\n    elements.has("OperatingRevenueIVT") ||\n    elements.has("OperatingRevenues")\n  ) {\n    return "operating-revenue";\n  }`,
  `  const hasConsolidatedNetSalesSummary = facts.some(\n    (fact) =>\n      localName(fact.name) === "NetSalesSummaryOfBusinessResults" &&\n      !fact.contextRef.includes("NonConsolidatedMember")\n  );\n\n  if (\n    !hasConsolidatedNetSalesSummary &&\n    (elements.has("OperatingRevenue1SummaryOfBusinessResults") ||\n      elements.has("OperatingRevenue1") ||\n      elements.has("OperatingRevenueIVT") ||\n      elements.has("OperatingRevenues"))\n  ) {\n    return "operating-revenue";\n  }`,
  "XBRL operating revenue profile detection"
);

console.log("Operating revenue profile patch applied");
