import fs from "fs";
import path from "path";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { calculateScores } from "../lib/scoring-engine";
import { calculateDanger } from "../lib/danger-engine";

const ticker = process.env.TICKER || "4478";
const docID = process.env.DOC_ID || "S100YEU4";

const financials = parseEdinetFinancials(docID);

const scores = calculateScores(financials);
const dangerScore = calculateDanger(financials);

const companyData = {
  ticker,
  ...financials,
  ...scores,
  dangerScore,
};

const outputDir = path.join(process.cwd(), "app", "company", ticker);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, "data.json");

fs.writeFileSync(outputPath, JSON.stringify(companyData, null, 2));

console.log("===== v1.4 Build Success =====");
console.table(companyData);
console.log(outputPath);