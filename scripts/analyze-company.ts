import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { calculateScores } from "../lib/scoring-engine";
import {
  classifyAuditor,
  parseDisclosureSignals,
} from "../lib/disclosure-parser";
import { analyzeRedFlags } from "../lib/redflag-engine";
import { classifyIndustry } from "../lib/industry-classifier";
import { supabaseAdmin } from "../lib/supabase";

type GrowthCompany = {
  ticker: string;
  name: string;
  edinetHint: string;
  edinetCode?: string | null;
  edinetFilerName?: string | null;
  edinetMatchedDocID?: string | null;
};

const ticker = process.env.TICKER || "";
const companyName = process.env.COMPANY_NAME || ticker;
const docID = process.env.DOC_ID || "";

if (!ticker) throw new Error("TICKER がありません");
if (!docID) throw new Error("DOC_ID がありません");

const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

function loadGrowthCompany(): GrowthCompany | null {
  if (!fs.existsSync(masterPath)) return null;
  const companies = JSON.parse(fs.readFileSync(masterPath, "utf8")) as GrowthCompany[];
  return companies.find((company) => company.ticker === ticker) ?? null;
}

function q(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function zipPath(id: string) {
  return path.join(process.cwd(), "downloads", `${id}.zip`);
}

function validZipExists(id: string) {
  const p = zipPath(id);
  if (!fs.existsSync(p)) return false;
  const b = fs.readFileSync(p);
  return b.length > 4 && b.subarray(0, 2).toString() === "PK";
}

function downloadIfNeeded(id: string) {
  if (validZipExists(id)) {
    console.log("既存ZIPを使用:", id);
    return;
  }

  execSync(`DOC_ID=${id} npx tsx scripts/download-edinet.ts`, {
    stdio: "inherit",
  });
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

function calculateOcfNegativeStreak(items: { operatingCF: number }[]) {
  let streak = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].operatingCF < 0) streak += 1;
    else break;
  }
  return streak;
}

async function main() {
  const growthCompany = loadGrowthCompany();

  const finalCompanyName = growthCompany?.name || companyName;
  const searchName =
    growthCompany?.edinetFilerName ||
    growthCompany?.edinetHint ||
    finalCompanyName;

  const industryType = classifyIndustry(finalCompanyName);

  downloadIfNeeded(docID);

  let historyDocIDs = fetchHistoryDocIDs(searchName);

  if (!historyDocIDs.includes(docID)) {
    historyDocIDs.unshift(docID);
  }

  historyDocIDs = Array.from(new Set(historyDocIDs)).slice(0, 3).reverse();

  const history: {
    year: string;
    revenue: number;
    operatingIncome: number;
    operatingCF: number;
  }[] = [];

  const currentYear = new Date().getFullYear();

  for (const [index, id] of historyDocIDs.entries()) {
    try {
      downloadIfNeeded(id);

      const f = parseEdinetFinancials(id);

      history.push({
        year: String(currentYear - historyDocIDs.length + 1 + index),
        revenue: f.revenue,
        operatingIncome: f.operatingIncome,
        operatingCF: f.operatingCF,
      });
    } catch (error) {
      console.log("history parse failed:", id);
    }
  }

  const financials = parseEdinetFinancials(docID);
  const scores = calculateScores(financials);
  const disclosureSignals = parseDisclosureSignals(docID);
  const ocfNegativeStreak = calculateOcfNegativeStreak(history);

  const previousAuditorType = classifyAuditor(
    disclosureSignals.previousAuditorName
  );

  const currentAuditorType = classifyAuditor(
    disclosureSignals.currentAuditorName
  );

  const redFlags = analyzeRedFlags({
    industryType,
    goingConcern: disclosureSignals.goingConcern,
    msWarrant: disclosureSignals.msWarrant,
    convertibleBond: disclosureSignals.convertibleBond,
    equityFinancing: disclosureSignals.equityFinancing,
    ocfNegativeStreak,
    currentAssets: financials.currentAssets,
    currentLiabilities: financials.currentLiabilities,
    equityRatio: scores.equityRatio,
    previousAuditorType,
    currentAuditorType,
  });

  const scoreBreakdown = {
    growth: scores.growthScore,
    quality: scores.qualityScore,
    safety: scores.safetyScore,
  };

  await supabaseAdmin
    .from("company_analyses")
    .delete()
    .eq("ticker", ticker)
    .eq("doc_id", docID);

  const { error } = await supabaseAdmin.from("company_analyses").insert({
    ticker,
    company_name: finalCompanyName,
    doc_id: docID,
    industry_type: industryType,
    score: scores.totalScore,
    danger_score: redFlags.dangerScore,
    risk_level: redFlags.riskLevel,
    financials,
    history,
    risk: redFlags,
    score_breakdown: scoreBreakdown,
  });

  if (error) throw error;

  console.log("===== Analyze Company DB Save Success =====");
  console.log("Company:", finalCompanyName);
  console.log("Ticker:", ticker);
  console.log("docID:", docID);
  console.log("History Count:", history.length);
  console.log("Score:", scores.totalScore);
  console.log("Danger:", redFlags.dangerScore);
  console.log("Risk:", redFlags.riskLevel);
  console.table(redFlags.flags);
  console.table(history);
}

main().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
  process.exit(1);
});