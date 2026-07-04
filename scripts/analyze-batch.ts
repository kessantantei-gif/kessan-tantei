import { execSync } from "child_process";

const targets = [
  { ticker: "4478", docID: "S100YEU4" },
];

console.log("===== Batch Analyze Start =====");

for (const target of targets) {
  console.log(`\n--- ${target.ticker} / ${target.docID} ---`);

  execSync(
    `TICKER=${target.ticker} DOC_ID=${target.docID} npx tsx scripts/analyze-company.ts`,
    { stdio: "inherit" }
  );
}

console.log("\n===== Batch Analyze Done =====");