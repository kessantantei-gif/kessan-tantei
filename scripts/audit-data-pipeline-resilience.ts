import fs from "node:fs";
import { isCorporateAnnualEdinetDocument } from "../lib/edinet-document-filter";

function read(path: string) {
  if (!fs.existsSync(path)) throw new Error(`Data pipeline resilience audit: missing ${path}`);
  return fs.readFileSync(path, "utf8");
}

function requireMarker(path: string, content: string, marker: string) {
  if (!content.includes(marker)) {
    throw new Error(`Data pipeline resilience audit: ${path} missing marker: ${marker}`);
  }
}

const analyzeCompanyPath = "scripts/analyze-company.ts";
const analyzeCompany = read(analyzeCompanyPath);
for (const marker of [
  "process.env.HISTORY_DOC_IDS",
  "suppliedHistoryIDs !== undefined",
  ": fetchHistoryDocIDs(searchName)",
]) requireMarker(analyzeCompanyPath, analyzeCompany, marker);

const financialReprocessPath = "scripts/reprocess-financial-sector-data.ts";
const financialReprocess = read(financialReprocessPath);
for (const marker of [
  "hasFinancialHistoryDrift",
  "!hasFinancialHistoryDrift(analysis)",
]) requireMarker(financialReprocessPath, financialReprocess, marker);

const rankingAuditPath = "scripts/audit-market-ranking-data.ts";
const rankingAudit = read(rankingAuditPath);
requireMarker(rankingAuditPath, rankingAudit, "loadRankingCompaniesUncached(market)");

if (!isCorporateAnnualEdinetDocument({ docTypeCode: "120", docDescription: "有価証券報告書－第76期" })) {
  throw new Error("Corporate annual EDINET document was incorrectly excluded");
}
if (isCorporateAnnualEdinetDocument({ docTypeCode: "120", docDescription: "有価証券報告書（内国信託受益証券等）－第1期" })) {
  throw new Error("Beneficiary trust EDINET document must not become corporate financials");
}
if (isCorporateAnnualEdinetDocument({ docTypeCode: "160", docDescription: "半期報告書" })) {
  throw new Error("Non-annual EDINET document was incorrectly selected");
}
for (const path of ["scripts/sync-daily-edinet.ts", "scripts/backfill-all-markets-edinet.ts"]) {
  requireMarker(path, read(path), "isCorporateAnnualEdinetDocument");
}

const dailyEdinetPath = "scripts/sync-daily-edinet.ts";
const dailyEdinet = read(dailyEdinetPath);
for (const marker of [
  "loadHistoryDocumentIds",
  'from("company_financial_periods")',
  'HISTORY_DOC_IDS: historyDocIds.join(",")',
  '.eq("is_foreign", false)',
]) requireMarker(dailyEdinetPath, dailyEdinet, marker);

const edinetBackfillPath = "scripts/backfill-all-markets-edinet.ts";
const edinetBackfill = read(edinetBackfillPath);
requireMarker(edinetBackfillPath, edinetBackfill, '.eq("is_foreign", false)');

const tdnetTitlePath = "lib/tdnet-document-title.ts";
const tdnetTitle = read(tdnetTitlePath);
if (!/決算短信\.\*\(\?:補足/.test(tdnetTitle)) {
  throw new Error("Data pipeline resilience audit: bare 決算短信補足 classification is not protected");
}

const textRepairPath = "scripts/repair-tdnet-text-block-financials.ts";
const textRepair = read(textRepairPath);
for (const marker of [
  "createdMissingQuarterlyRow: true",
  "repairedFromStoredDisclosure: true",
  '.from("company_quarterly_financials")',
  ".insert({",
]) requireMarker(textRepairPath, textRepair, marker);

const cashFlowAuditPath = "scripts/audit-tdnet-cash-flow.ts";
const cashFlowAudit = read(cashFlowAuditPath);
for (const required of [
  "archivedWithoutRawCashFlowEvidence",
  "archivedRawFactsVerified",
  "cashFlowDiffs(stored, evidence)",
  "freshSourceChecked",
  "if (!row)",
  "if (disclosure.disclosed_at.slice(0, 10) < freshCutoff) continue;",
]) requireMarker(cashFlowAuditPath, cashFlowAudit, required);

const diagnosticWorkflow = read(".github/workflows/diagnose-tdnet-cash-flow.yml");
requireMarker(".github/workflows/diagnose-tdnet-cash-flow.yml", diagnosticWorkflow, "npm run repair:tdnet-audit-gaps");

const tdnetXbrlAuditPath = "scripts/audit-tdnet-xbrl-availability-v2.ts";
const tdnetXbrlAudit = read(tdnetXbrlAuditPath);
for (const marker of [
  "missingXbrlWithStoredFinancials",
  "unresolvedMissingXbrl",
  'from("company_quarterly_financials")',
  '.from("all_market_companies")',
  '.eq("is_foreign", true)',
  "skippedForeignSecurities",
  "domesticMissingXbrl",
]) requireMarker(tdnetXbrlAuditPath, tdnetXbrlAudit, marker);

const gapRepairPath = "scripts/repair-tdnet-audit-gaps.ts";
const gapRepair = read(gapRepairPath);
for (const marker of [
  "runStoredDisclosureRepair",
  "repair-tdnet-text-block-financials.ts",
  "gap repaired from stored disclosure",
  "isTdnetNonEarningsDocument",
  "repairScopeAlias",
  "repairQ4FromAnnualEdinet",
  'from("company_financial_periods")',
  "tdnet-gap-from-edinet-annual-v1",
  "repairKnownOfficialGap",
  "tdnet-official-ir-gap-repair-v1",
]) requireMarker(gapRepairPath, gapRepair, marker);

const backfillPath = ".github/workflows/all-markets-backfill.yml";
const backfill = read(backfillPath);
requireMarker(
  backfillPath,
  backfill,
  "REPAIR_SCORE_MODELS=1 npm run audit:all-markets-data"
);

const nightlyPath = ".github/workflows/all-markets-nightly.yml";
const nightly = read(nightlyPath);
requireMarker(
  nightlyPath,
  nightly,
  "REPAIR_SCORE_MODELS=1 npm run complete:all-markets -- --with-daily-edinet --with-repairs --skip-production-final-audit"
);

const completionPath = "scripts/run-all-markets-completion.ts";
const completion = read(completionPath);
for (const marker of [
  "--skip-production-final-audit",
  "includeProductionFinalAudit",
]) requireMarker(completionPath, completion, marker);

const quarterlyWorkflowPath = ".github/workflows/quarterly-disclosures.yml";
const quarterlyWorkflow = read(quarterlyWorkflowPath);
for (const marker of [
  "scripts/audit-tdnet-xbrl-availability-v2.ts",
  "lib/tdnet-document-title.ts",
]) requireMarker(quarterlyWorkflowPath, quarterlyWorkflow, marker);


console.log("Data pipeline resilience audit passed.");
