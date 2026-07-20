import { extractFinancials } from "../lib/edinet-financial-parser";
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
<jpigp_cor:OperatingRevenuesIFRSKeyFinancialData contextRef="CurrentYearConsolidatedDuration">50684952000000</jpigp_cor:OperatingRevenuesIFRSKeyFinancialData>
<jpigp_cor:Revenue2IFRS contextRef="CurrentYearConsolidatedDuration">594243000000</jpigp_cor:Revenue2IFRS>
<jpigp_cor:GrossProfitIFRS contextRef="CurrentYearConsolidatedDuration">3980334000000</jpigp_cor:GrossProfitIFRS>
<jpigp_cor:OperatingProfitLossIFRS contextRef="CurrentYearConsolidatedDuration">3766216000000</jpigp_cor:OperatingProfitLossIFRS>
<jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">3848098000000</jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults>
<jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS contextRef="CurrentYearConsolidatedDuration">3392326000000</jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS>
<jpigp_cor:AssetsIFRS contextRef="CurrentYearConsolidatedInstant">90214094000000</jpigp_cor:AssetsIFRS>
<jpigp_cor:EquityAttributableToOwnersOfParentIFRS contextRef="CurrentYearConsolidatedInstant">35000000000000</jpigp_cor:EquityAttributableToOwnersOfParentIFRS>
`)
);

assert(ifrs.financialProfile === "ifrs", "IFRSプロファイルを判定できません");
assert(ifrs.revenue === 50684952000000, "IFRSの主要業績売上高を優先できません");
assert(ifrs.grossProfit === 3980334000000, "IFRSの売上総利益を取得できません");
assert(ifrs.netIncome === 3848098000000, "IFRSの経営指標サマリー純利益を優先できません");

const csvIfrs = extractFinancials([
  {
    要素ID: "jpigp_cor:OperatingRevenuesIFRSKeyFinancialData",
    項目名: "",
    コンテキストID: "CurrentYearDuration",
    単位: "円",
    値: "50684952000000",
  },
  {
    要素ID: "jpigp_cor:OperatingRevenuesIFRSKeyFinancialData",
    項目名: "",
    コンテキストID: "Prior1YearDuration",
    単位: "円",
    値: "48036704000000",
  },
  {
    要素ID: "jpigp_cor:Revenue2IFRS",
    項目名: "収益（IFRS）",
    コンテキストID: "CurrentYearDuration",
    単位: "円",
    値: "594243000000",
  },
  {
    要素ID: "jpigp_cor:Revenue2IFRS",
    項目名: "収益（IFRS）",
    コンテキストID: "Prior1YearDuration",
    単位: "円",
    値: "560000000000",
  },
  {
    要素ID: "jpigp_cor:GrossProfitIFRS",
    項目名: "売上総利益（IFRS）",
    コンテキストID: "CurrentYearDuration",
    単位: "円",
    値: "3980334000000",
  },
  {
    要素ID: "jpigp_cor:GrossProfitIFRS",
    項目名: "売上総利益（IFRS）",
    コンテキストID: "Prior1YearDuration",
    単位: "円",
    値: "3500000000000",
  },
  {
    要素ID: "jpigp_cor:OperatingProfitLossIFRS",
    項目名: "営業利益（IFRS）",
    コンテキストID: "CurrentYearDuration",
    単位: "円",
    値: "3766216000000",
  },
  {
    要素ID: "jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults",
    項目名: "当期利益：親会社の所有者に帰属（IFRS）、経営指標等",
    コンテキストID: "CurrentYearDuration",
    単位: "円",
    値: "3848098000000",
  },
  {
    要素ID: "jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults",
    項目名: "当期利益：親会社の所有者に帰属（IFRS）、経営指標等",
    コンテキストID: "Prior1YearDuration",
    単位: "円",
    値: "4765865000000",
  },
  {
    要素ID: "jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS",
    項目名: "親会社の所有者に帰属する利益（IFRS）",
    コンテキストID: "CurrentYearDuration",
    単位: "円",
    値: "3392326000000",
  },
]);

assert(csvIfrs.current.revenue === 50684952000000, "CSVのIFRS主要業績売上高を優先できません");
assert(csvIfrs.prior.revenue === 48036704000000, "CSVのIFRS前期売上高を優先できません");
assert(csvIfrs.current.netIncome === 3848098000000, "CSVのIFRSサマリー純利益を優先できません");
assert(csvIfrs.prior.netIncome === 4765865000000, "CSVのIFRS前期純利益を優先できません");

const missing = parseEdinetFinancialsFromXbrl(
  xbrl(`
<jppfs_cor:NetSales contextRef="CurrentYearConsolidatedDuration">100000</jppfs_cor:NetSales>
<jppfs_cor:OperatingIncome contextRef="CurrentYearConsolidatedDuration">10000</jppfs_cor:OperatingIncome>
`)
);

assert(missing.grossProfit === null, "欠損した売上総利益をゼロ保存しています");
assert(missing.netIncome === null, "欠損した純利益をゼロ保存しています");

console.log("Prime / Standard ranking parser checks: OK");
