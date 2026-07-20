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

const bank = parseEdinetFinancialsFromXbrl(xbrl(`
<jppfs_cor:OrdinaryIncomeBNK contextRef="CurrentYearConsolidatedDuration">1200</jppfs_cor:OrdinaryIncomeBNK>
<jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">180</jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults>
<jppfs_cor:CashAndDueFromBanksAssetsBNK contextRef="CurrentYearConsolidatedInstant">300</jppfs_cor:CashAndDueFromBanksAssetsBNK>
<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">5000</jppfs_cor:Assets>
<jppfs_cor:NetAssets contextRef="CurrentYearConsolidatedInstant">600</jppfs_cor:NetAssets>
`));
assert(bank.financialProfile === "bank", "銀行業プロファイルを判定できません");
assert(bank.revenue === 1200 && bank.operatingIncome === 180, "銀行業の経常収益・経常利益を取得できません");
assert(bank.currentRatioApplicable === false, "銀行業へ流動比率を適用しています");

const insurance = parseEdinetFinancialsFromXbrl(xbrl(`
<jpcrp_cor:OrdinaryIncomeSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">2200</jpcrp_cor:OrdinaryIncomeSummaryOfBusinessResults>
<jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">200</jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults>
<example:InsuranceRevenueIFRS contextRef="CurrentYearConsolidatedDuration">1900</example:InsuranceRevenueIFRS>
<jppfs_cor:CashAndDepositsAssetsINS contextRef="CurrentYearConsolidatedInstant">350</jppfs_cor:CashAndDepositsAssetsINS>
<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">7000</jppfs_cor:Assets>
`));
assert(insurance.financialProfile === "insurance", "保険業プロファイルを判定できません");
assert(insurance.revenue === 2200 && insurance.operatingIncome === 200, "保険業の経常収益・経常利益を取得できません");

const insuranceIfrs = parseEdinetFinancialsFromXbrl(xbrl(`
<example:InsuranceRevenueIFRS contextRef="CurrentYearConsolidatedDuration">5200</example:InsuranceRevenueIFRS>
<jpigp_cor:Revenue2IFRS contextRef="CurrentYearConsolidatedDuration">5600</jpigp_cor:Revenue2IFRS>
<jpcrp_cor:ProfitLossBeforeTaxIFRSSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">800</jpcrp_cor:ProfitLossBeforeTaxIFRSSummaryOfBusinessResults>
<jpigp_cor:CashAndCashEquivalentsIFRS contextRef="CurrentYearConsolidatedInstant">400</jpigp_cor:CashAndCashEquivalentsIFRS>
<jpigp_cor:AssetsIFRS contextRef="CurrentYearConsolidatedInstant">9000</jpigp_cor:AssetsIFRS>
`));
assert(insuranceIfrs.financialProfile === "insurance-ifrs", "IFRS保険業プロファイルを判定できません");
assert(insuranceIfrs.revenue === 5600 && insuranceIfrs.operatingIncome === 800, "IFRS保険業の収益・税引前利益を取得できません");

const securities = parseEdinetFinancialsFromXbrl(xbrl(`
<jppfs_cor:OperatingRevenueSEC contextRef="CurrentYearConsolidatedDuration">900</jppfs_cor:OperatingRevenueSEC>
<jppfs_cor:OperatingIncome contextRef="CurrentYearConsolidatedDuration">90</jppfs_cor:OperatingIncome>
<jppfs_cor:CurrentAssets contextRef="CurrentYearConsolidatedInstant">1000</jppfs_cor:CurrentAssets>
`));
assert(securities.financialProfile === "securities" && securities.revenue === 900, "証券業の営業収益を取得できません");

const ifrs = parseEdinetFinancialsFromXbrl(xbrl(`
<jpcrp_cor:RevenueIFRSSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">3000</jpcrp_cor:RevenueIFRSSummaryOfBusinessResults>
<jpigp_cor:OperatingProfitLossIFRS contextRef="CurrentYearConsolidatedDuration">500</jpigp_cor:OperatingProfitLossIFRS>
<jpcrp_cor:CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">450</jpcrp_cor:CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults>
<jpigp_cor:AssetsIFRS contextRef="CurrentYearConsolidatedInstant">8000</jpigp_cor:AssetsIFRS>
`));
assert(ifrs.financialProfile === "ifrs", "IFRSプロファイルを判定できません");
assert(ifrs.revenue === 3000 && ifrs.operatingIncome === 500 && ifrs.operatingCF === 450, "IFRSの売上収益・営業利益・営業CFを取得できません");

const operatingRevenue = parseEdinetFinancialsFromXbrl(xbrl(`
<jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults contextRef="CurrentYearConsolidatedDuration">1500</jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults>
<jppfs_cor:OperatingIncome contextRef="CurrentYearConsolidatedDuration">240</jppfs_cor:OperatingIncome>
<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">4000</jppfs_cor:Assets>
`));
assert(operatingRevenue.financialProfile === "operating-revenue", "営業収益型プロファイルを判定できません");
assert(operatingRevenue.revenue === 1500 && operatingRevenue.operatingIncome === 240, "営業収益型企業の数値を取得できません");

console.log("金融業EDINETパーサー検証: OK");
