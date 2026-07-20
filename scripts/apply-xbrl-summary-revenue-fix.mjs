import { readFileSync, writeFileSync } from "node:fs";

const path = "lib/edinet-parser.ts";
const source = readFileSync(path, "utf8");
const before = `    revenueElements: [\n      "NetSales",\n      "Sales",\n      "Revenue",\n      "Revenues",\n      "OperatingRevenue",\n      "BusinessRevenue",\n      "SalesRevenue",\n    ],`;
const after = `    revenueElements: [\n      "NetSalesSummaryOfBusinessResults",\n      "RevenueSummaryOfBusinessResults",\n      "OperatingRevenueSummaryOfBusinessResults",\n      "NetSales",\n      "Sales",\n      "Revenue",\n      "Revenues",\n      "OperatingRevenue",\n      "BusinessRevenue",\n      "SalesRevenue",\n    ],`;
const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`general revenue elements: expected one match, found ${count}`);
}
writeFileSync(path, source.replace(before, after), "utf8");
console.log("XBRL summary revenue patch applied");
