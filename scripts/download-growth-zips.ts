import fs from "fs";
import path from "path";
import { execSync } from "child_process";

type GrowthCompany = {
  ticker: string;
  name: string;
  edinetCode?: string | null;
  edinetMatchedDocID?: string | null;
};

const start = Number(process.env.START || 0);
const limit = Number(process.env.LIMIT || 597);
const waitMs = Number(process.env.WAIT_MS || 60000);

const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

const companies = JSON.parse(
  fs.readFileSync(masterPath, "utf8")
) as GrowthCompany[];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const targets = companies.slice(start, start + limit);

  console.log("===== Download Growth ZIPs Start =====");
  console.log("Start:", start);
  console.log("Limit:", limit);
  console.log("Targets:", targets.length);
  console.log("Wait:", `${waitMs / 1000}s`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const [index, company] of targets.entries()) {
    console.log("\n====================================");
    console.log(`[${start + index + 1}/${companies.length}] ${company.ticker} ${company.name}`);

    if (!company.edinetMatchedDocID) {
      console.log("SKIP: docID missing");
      skipped++;
      continue;
    }

    try {
      execSync(`DOC_ID=${company.edinetMatchedDocID} npx tsx scripts/download-edinet.ts`, {
        stdio: "inherit",
      });

      success++;
    } catch {
      console.log("FAILED:", company.ticker);
      failed++;
    }

    await sleep(waitMs);
  }

  console.log("\n===== Download Growth ZIPs Done =====");
  console.log("Success:", success);
  console.log("Failed:", failed);
  console.log("Skipped:", skipped);
}

main();