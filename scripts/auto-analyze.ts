import { execSync } from "child_process";

const ticker = process.env.TICKER;
const companyName = process.env.COMPANY_NAME;
const date = process.env.EDINET_DATE;

if (!ticker) throw new Error("TICKER がありません");
if (!companyName) throw new Error("COMPANY_NAME がありません");
if (!date) throw new Error("EDINET_DATE がありません");

console.log("===== Auto Analyze Start =====");
console.log("ticker:", ticker);
console.log("company:", companyName);
console.log("date:", date);

const searchOutput = execSync(
  `COMPANY_NAME=${companyName} EDINET_DATE=${date} npx tsx scripts/fetch-edinet.ts`,
  { encoding: "utf8" }
);

console.log(searchOutput);

const match = searchOutput.match(/S100[A-Z0-9]+/);

if (!match) {
  throw new Error("docID が見つかりませんでした");
}

const docID = match[0];

console.log("docID:", docID);

execSync(`DOC_ID=${docID} npx tsx scripts/download-edinet.ts`, {
  stdio: "inherit",
});

execSync(`TICKER=${ticker} DOC_ID=${docID} npx tsx scripts/analyze-company.ts`, {
  stdio: "inherit",
});

console.log("===== Auto Analyze Done =====");