import fs from "fs";
import path from "path";
import { execSync } from "child_process";

type GrowthCompany = {
  ticker: string;
  name: string;
  market: string;
  sector33: string;
  sector17: string;
  edinetHint: string;
  edinetCode?: string | null;
  edinetFilerName?: string | null;
  edinetMatchedDocID?: string | null;
  edinetMatchedDate?: string | null;
  edinetSecCode?: string | null;
};

const limit = Number(process.env.LIMIT || 5);
const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

if (!fs.existsSync(masterPath)) {
  throw new Error("data/growth-companies.json が見つかりません");
}

const companies = JSON.parse(
  fs.readFileSync(masterPath, "utf8")
) as GrowthCompany[];

console.log("===== Growth Batch Analyze Start =====");
console.log("Total master:", companies.length);
console.log("Limit:", limit);

let success = 0;
let failed = 0;
let skipped = 0;

for (const company of companies.slice(0, limit)) {
  console.log("\n====================================");
  console.log(`${company.ticker} ${company.name}`);

  try {
    const docID = company.edinetMatchedDocID;

    if (!company.edinetCode || !docID) {
      console.log("SKIP: EDINET code or docID missing");
      skipped += 1;
      continue;
    }

    console.log("edinetCode:", company.edinetCode);
    console.log("docID:", docID);

    execSync(`DOC_ID=${docID} npx tsx scripts/download-edinet.ts`, {
      stdio: "inherit",
    });

    execSync(
      `COMPANY_NAME="${company.name}" TICKER=${company.ticker} DOC_ID=${docID} npx tsx scripts/analyze-company.ts`,
      { stdio: "inherit" }
    );

    success += 1;
  } catch (error) {
    failed += 1;
    console.log("FAILED:", company.ticker, company.name);
  }
}

console.log("\n===== Growth Batch Analyze Done =====");
console.log("Success:", success);
console.log("Failed:", failed);
console.log("Skipped:", skipped);