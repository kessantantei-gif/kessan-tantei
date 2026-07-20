import { mkdirSync, writeFileSync } from "node:fs";
import { extractFinancials } from "../lib/edinet-financial-parser";
import { parseEdinetFinancialsFromXbrl } from "../lib/edinet-parser";

const failures: string[] = [];
function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

const csv = extractFinancials([
  {
    要素ID: "jpcrp_cor:NetSalesSummaryOfBusinessResults",
    項目名: "売上高、経営指標等",
    コンテキストID: "CurrentYearDuration",
    単位: "円",
    値: "339487000000",
  },
  {
    要素ID: "jpcrp_cor:NetSalesSummaryOfBusinessResults",
    項目名: "売上高、経営指標等",
    コンテキストID: "Prior1YearDuration",
    単位: "円",
    値: "324056000000",
  },
  {
    要素ID: "jppfs_cor:OperatingRevenue1",
    項目名: "営業収益",
    コンテキストID: "CurrentYearDuration_NonConsolidatedMember",
    単位: "円",
    値: "3330000000",
  },
  {
    要素ID: "jppfs_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults",
    項目名: "親会社株主に帰属する当期純利益、経営指標等",
    コンテキストID: "CurrentYearDuration",
    単位: "円",
    値: "29654000000",
  },
]);

check(
  csv.metadata.financialProfile === "general",
  "CSVで連結売上高がある持株会社を営業収益型に誤分類しています"
);
check(
  csv.current.revenue === 339487000000,
  "CSVで連結売上高を取得できません"
);

const xbrl = parseEdinetFinancialsFromXbrl(`
<xbrli:context id="CurrentYearDuration">
  <xbrli:period><xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period>
</xbrli:context>
<xbrli:context id="CurrentYearDuration_NonConsolidatedMember">
  <xbrli:entity><xbrli:segment><xbrldi:explicitMember>NonConsolidatedMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
  <xbrli:period><xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period>
</xbrli:context>
<jpcrp_cor:NetSalesSummaryOfBusinessResults contextRef="CurrentYearDuration">339487000000</jpcrp_cor:NetSalesSummaryOfBusinessResults>
<jppfs_cor:OperatingRevenue1 contextRef="CurrentYearDuration_NonConsolidatedMember">3330000000</jppfs_cor:OperatingRevenue1>
<jppfs_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults contextRef="CurrentYearDuration">29654000000</jppfs_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults>
`);

check(
  xbrl.financialProfile === "general",
  "XBRLで連結売上高がある持株会社を営業収益型に誤分類しています"
);
check(
  xbrl.revenue === 339487000000,
  "XBRLで連結売上高を取得できません"
);

const report = {
  generatedAt: new Date().toISOString(),
  ok: failures.length === 0,
  failures,
  csv: {
    financialProfile: csv.metadata.financialProfile,
    revenue: csv.current.revenue,
    priorRevenue: csv.prior.revenue,
  },
  xbrl: {
    financialProfile: xbrl.financialProfile,
    revenue: xbrl.revenue,
  },
};

mkdirSync("reports", { recursive: true });
writeFileSync(
  "reports/operating-revenue-profile-check.json",
  JSON.stringify(report, null, 2),
  "utf8"
);
console.log(report);

if (failures.length > 0) process.exit(1);
console.log("Operating revenue profile checks: OK");
