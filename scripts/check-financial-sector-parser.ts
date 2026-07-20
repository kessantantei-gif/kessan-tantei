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

const bank = parseEdinetFinancialsFromXbrl(
  xbrl(`
<jppfs_cor:OrdinaryIncomeBNK contextRef="CurrentYearConsolidatedDuration">1200</jppfs_cor:OrdinaryIncomeBNK>
<jppfs_cor:OrdinaryIncome contextRef="CurrentYearConsolidatedDuration">180</jppfs_cor:OrdinaryIncome>
<jppfs_cor:CashAndDueFromBanksAssetsBNK contextRef="CurrentYearConsolidatedInstant">300</jppfs_cor:CashAndDueFromBanksAssetsBNK>
<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">5000</jppfs_cor:Assets>
<jppfs_cor:NetAssets contextRef="CurrentYearConsolidatedInstant">600</jppfs_cor:NetAssets>
`)
);

assert(bank.financialProfile === "bank", "銀行業プロファイルを判定できません");
assert(bank.revenue === 1200, "銀行業の経常収益を取得できません");
assert(bank.operatingIncome === 180, "銀行業の経常利益を取得できません");
assert(bank.cash === 300, "銀行業の現金預け金を取得できません");
assert(bank.currentAssets === 0 && bank.currentLiabilities === 0, "銀行業へ流動区分を適用しています");

const insurance = parseEdinetFinancialsFromXbrl(
  xbrl(`
<jppfs_cor:OperatingIncomeINS contextRef="CurrentYearConsolidatedDuration">2200</jppfs_cor:OperatingIncomeINS>
<jppfs_cor:OrdinaryIncome contextRef="CurrentYearConsolidatedDuration">200</jppfs_cor:OrdinaryIncome>
<jppfs_cor:CashAndDepositsAssetsINS contextRef="CurrentYearConsolidatedInstant">350</jppfs_cor:CashAndDepositsAssetsINS>
<jppfs_cor:Assets contextRef="CurrentYearConsolidatedInstant">7000</jppfs_cor:Assets>
<jppfs_cor:NetAssets contextRef="CurrentYearConsolidatedInstant">900</jppfs_cor:NetAssets>
`)
);

assert(insurance.financialProfile === "insurance", "保険業プロファイルを判定できません");
assert(insurance.revenue === 2200, "保険業の経常収益を取得できません");
assert(insurance.operatingIncome === 200, "保険業の経常利益を取得できません");
assert(insurance.cash === 350, "保険業の現金及び預貯金を取得できません");

const securities = parseEdinetFinancialsFromXbrl(
  xbrl(`
<jppfs_cor:OperatingRevenueSEC contextRef="CurrentYearConsolidatedDuration">900</jppfs_cor:OperatingRevenueSEC>
<jppfs_cor:NetOperatingRevenueSEC contextRef="CurrentYearConsolidatedDuration">600</jppfs_cor:NetOperatingRevenueSEC>
<jppfs_cor:OperatingIncome contextRef="CurrentYearConsolidatedDuration">90</jppfs_cor:OperatingIncome>
<jppfs_cor:CurrentAssets contextRef="CurrentYearConsolidatedInstant">1000</jppfs_cor:CurrentAssets>
<jppfs_cor:CurrentLiabilities contextRef="CurrentYearConsolidatedInstant">400</jppfs_cor:CurrentLiabilities>
`)
);

assert(securities.financialProfile === "securities", "証券業プロファイルを判定できません");
assert(securities.revenue === 900, "証券業の営業収益を取得できません");
assert(securities.operatingIncome === 90, "証券業の営業利益を取得できません");
assert(securities.currentAssets === 1000, "証券業の流動資産を取得できません");

console.log("金融業EDINETパーサー検証: OK");
