import fs from "fs";
import path from "path";
import { execSync } from "child_process";

type GrowthCompany = {
  ticker: string;
  name: string;
  edinetHint?: string | null;
  edinetFilerName?: string | null;
  edinetMatchedDocID?: string | null;
  historyDocIDs?: string[];
};

const start = Number(process.env.START || 0);
const limit = Number(process.env.LIMIT || 50);
const waitMs = Number(process.env.WAIT_MS || 30000);

const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

const companies = JSON.parse(
  fs.readFileSync(masterPath, "utf8")
) as GrowthCompany[];

function q(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchHistoryDocIDs(searchName: string): string[] {
  const output = execSync(
    `COMPANY_NAME=${q(searchName)} npx tsx scripts/fetch-history.ts`,
    { encoding: "utf8" }
  );

  return Array.from(
    new Set([...output.matchAll(/S100[A-Z0-9]+/g)].map((m) => m[0]))
  );
}

async function main() {
  console.log("===== Sync Growth History DocIDs Start =====");
  console.log("Start:", start);
  console.log("Limit:", limit);
  console.log("Wait:", `${waitMs / 1000}s`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  const targets = companies.slice(start, start + limit);

  for (const [index, company] of targets.entries()) {
    console.log("\n====================================");
    console.log(`[${start + index + 1}/${companies.length}] ${company.ticker} ${company.name}`);

    if (company.historyDocIDs && company.historyDocIDs.length > 0) {
      console.log("SKIP: historyDocIDs already exists");
      skipped++;
      continue;
    }

    const searchName =
      company.edinetFilerName ||
      company.edinetHint ||
      company.name;

    try {
      let ids = fetchHistoryDocIDs(searchName);

      if (company.edinetMatchedDocID && !ids.includes(company.edinetMatchedDocID)) {
        ids.unshift(company.edinetMatchedDocID);
      }

      ids = Array.from(new Set(ids)).slice(0, 3);

      company.historyDocIDs = ids;

      fs.writeFileSync(masterPath, JSON.stringify(companies, null, 2));

      console.log("historyDocIDs:", ids.join(", "));
      updated++;
    } catch (error) {
      console.log("FAILED:", company.ticker);
      failed++;
    }

    await sleep(waitMs);
  }

  console.log("\n===== Sync Growth History DocIDs Done =====");
  console.log("Updated:", updated);
  console.log("Skipped:", skipped);
  console.log("Failed:", failed);
}

main();