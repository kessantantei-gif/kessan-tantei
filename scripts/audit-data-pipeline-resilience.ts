import fs from "node:fs";

function read(path: string) {
  if (!fs.existsSync(path)) throw new Error(`Data pipeline resilience audit: missing ${path}`);
  return fs.readFileSync(path, "utf8");
}

function requireMarker(path: string, content: string, marker: string) {
  if (!content.includes(marker)) {
    throw new Error(`Data pipeline resilience audit: ${path} missing marker: ${marker}`);
  }
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
  "REPAIR_SCORE_MODELS=1 npm run complete:all-markets -- --with-daily-edinet --with-repairs"
);

console.log("Data pipeline resilience audit passed.");
