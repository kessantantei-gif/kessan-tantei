import fs from "fs";
import path from "path";
import { execSync } from "child_process";

type GrowthCompany = {
  ticker: string;
  name: string;
  edinetCode?: string | null;
  edinetMatchedDocID?: string | null;
};

type BootstrapState = {
  completedTickers: string[];
  failed: {
    ticker: string;
    name: string;
    reason: string;
    failedAt: string;
  }[];
};

const limit = Number(process.env.LIMIT || 20);
const start = Number(process.env.START || 0);
const waitMs = Number(process.env.WAIT_MS || 30000);
const force = process.env.FORCE_REPROCESS === "1";

const masterPath = path.join(process.cwd(), "data", "growth-companies.json");
const statePath = path.join(process.cwd(), "data", "bootstrap-state.json");

if (!fs.existsSync(masterPath)) {
  throw new Error("data/growth-companies.json が見つかりません");
}

const companies = JSON.parse(
  fs.readFileSync(masterPath, "utf8")
) as GrowthCompany[];

function loadState(): BootstrapState {
  if (!fs.existsSync(statePath)) {
    return { completedTickers: [], failed: [] };
  }

  return JSON.parse(fs.readFileSync(statePath, "utf8")) as BootstrapState;
}

function saveState(state: BootstrapState) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const state = loadState();

  const targets = companies
    .slice(start, start + limit)
    .filter((company) => force || !state.completedTickers.includes(company.ticker));

  console.log("===== Bootstrap Growth History Start =====");
  console.log("Total master:", companies.length);
  console.log("Start:", start);
  console.log("Limit:", limit);
  console.log("Targets:", targets.length);
  console.log("Wait:", `${waitMs / 1000}s`);
  console.log("Force:", force);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const [index, company] of targets.entries()) {
    console.log("\n====================================");
    console.log(`[${start + index + 1}/${companies.length}] ${company.ticker} ${company.name}`);

    if (!company.edinetCode || !company.edinetMatchedDocID) {
      console.log("SKIP: edinetCode/docID missing");
      skipped += 1;
      continue;
    }

    try {
      execSync(
        `COMPANY_NAME="${company.name}" TICKER=${company.ticker} DOC_ID=${company.edinetMatchedDocID} npx tsx scripts/analyze-company.ts`,
        { stdio: "inherit" }
      );

      state.completedTickers = Array.from(
        new Set([...state.completedTickers, company.ticker])
      );

      state.failed = state.failed.filter((f) => f.ticker !== company.ticker);
      saveState(state);

      success += 1;
      console.log("BOOTSTRAP SAVED:", company.ticker);
    } catch (error) {
      failed += 1;

      const reason = error instanceof Error ? error.message : "unknown error";

      state.failed = state.failed.filter((f) => f.ticker !== company.ticker);
      state.failed.push({
        ticker: company.ticker,
        name: company.name,
        reason,
        failedAt: new Date().toISOString(),
      });

      saveState(state);
      console.log("BOOTSTRAP FAILED:", company.ticker);
    }

    console.log(`WAIT ${waitMs / 1000}s`);
    await sleep(waitMs);
  }

  console.log("\n===== Bootstrap Growth History Done =====");
  console.log("Success:", success);
  console.log("Failed:", failed);
  console.log("Skipped:", skipped);
  console.log("Completed total:", state.completedTickers.length);
}

main().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
  process.exit(1);
});