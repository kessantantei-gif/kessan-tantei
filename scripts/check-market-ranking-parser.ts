import { parseEdinetFinancialsFromXbrl } from "../lib/edinet-parser";

function xbrl(facts: string) {
  return `
<xbrli:context id="CurrentYearConsolidatedDuration">
  <xbrli:entity><xbrli:segment><xbrldi:explicitMember>ConsolidatedMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
  <xbrli:period><xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period>
</xbrli:context>
<xbrli:context id="CurrentYearConsolidatedInstant">
  <xbrli:entity><xbrli:segment><xbrldi:explicitMember>ConsolidatedMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
  <xbrli:period><xbrli:instant>2026-03-31</xbrli:instant></xbrli:period>
</xbrli:context>
${facts}`;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const japaneseGaap = parseEdinetFinancialsFromXbrl(
  xbrl(`
<jppfs_cor:NetSales contextRef="CurrentYearConsolidatedDuration">1000000</jppfs_cor:NetSales>
<jppfs_cor:GrossProfit contextRef="CurrentYearConsolidatedDuration">420000</jppfs_cor:GrossProfit>
<jppfs_cor:OperatingIncome contextRef="CurrentYearConsolidatedDuration">110000</jppfs_cor:OperatingIncome>
<jppfs_cor:ProfitLossAttributableToOwnersOfParent contextRef="CurrentYearConsolidatedDuration">72000</jppfs_cor:ProfitLossAttributableToOwnersOfParent>
<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">1800000</jppfs_cor:Assets>
<jppfs_cor:NetAssets contextRef="CurrentYearConsolidatedInstant">900000</jppfs_cor:NetAssets>
`)
);

assert(japaneseGaap.grossProfit === 420000, "日本基準の売上総利益を取得できません");
assert(japaneseGaap.netIncome === 72000, "日本基準の親会社株主帰属純利益を取得できません");

const ifrs = parseEdinetFinancialsFromXbrl(
  xbrl(`
<jpigp_cor:RevenueIFRSSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">2000000</jpigp_cor:RevenueIFRSSummaryOfBusinessResults>
<jpigp_cor:GrossProfitIFRS contextRef="CurrentYearConsolidatedDuration">800000</jpigp_cor:GrossProfitIFRS>
<jpigp_cor:OperatingProfitLossIFRS contextRef="CurrentYearConsolidatedDuration">240000</jpigp_cor:OperatingProfitLossIFRS>
<jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS contextRef="CurrentYearConsolidatedDuration">160000</jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS>
<jpigp_cor:AssetsIFRS contextRef="CurrentYearConsolidatedInstant">3500000</jpigp_cor:AssetsIFRS>
<jpigp_cor:EquityAttributableToOwnersOfParentIFRS contextRef="CurrentYearConsolidatedInstant">1700000</jpigp_cor:EquityAttributableToOwnersOfParentIFRS>
`)
);

assert(ifrs.financialProfile === "ifrs", "IFRSプロファイルを判定できません");
assert(ifrs.grossProfit === 800000, "IFRSの売上総利益を取得できません");
assert(ifrs.netIncome === 160000, "IFRSの親会社帰属利益を取得できません");

const missing = parseEdinetFinancialsFromXbrl(
  xbrl(`
<jppfs_cor:NetSales contextRef="CurrentYearConsolidatedDuration">100000</jppfs_cor:NetSales>
<jppfs_cor:OperatingIncome contextRef="CurrentYearConsolidatedDuration">10000</jppfs_cor:OperatingIncome>
`)
);

assert(missing.grossProfit === null, "欠損した売上総利益をゼロ保存しています");
assert(missing.netIncome === null, "欠損した純利益をゼロ保存しています");

console.log("Prime / Standard ranking parser checks: OK");
