import growthCompanies from "../data/growth-companies.json";
import curatedCompanyMaster from "../data/company-master.json";
import {
  getCompanyMaster,
  getCompanyMasterCoverage,
  getCompanyMasterEntries,
  getSameThemeTickers,
} from "../lib/company-master";
import { rankingDefinitions } from "../lib/rankings/definitions";
import fs from "node:fs";
import path from "node:path";

type GrowthCompany = { ticker: string; name: string };
type CuratedEntry = { ticker: string; rivalTickers?: string[]; reviewed?: boolean };

const errors: string[] = [];
const warnings: string[] = [];
const companies = growthCompanies as GrowthCompany[];
const curated = curatedCompanyMaster as CuratedEntry[];
const tickerSet = new Set(companies.map((company) => company.ticker));
const masterEntries = getCompanyMasterEntries();
const coverage = getCompanyMasterCoverage();

for (const company of companies) {
  const entry = getCompanyMaster(company.ticker);
  if (!entry) {
    errors.push(`会社マスタ未生成: ${company.ticker} ${company.name}`);
    continue;
  }

  if (!entry.theme || !entry.subTheme || !entry.businessModel) {
    errors.push(`分類情報不足: ${company.ticker} ${company.name}`);
  }
}

for (const entry of curated) {
  for (const rivalTicker of entry.rivalTickers ?? []) {
    if (!tickerSet.has(rivalTicker)) {
      warnings.push(`監修ライバルがgrowth-companiesに未登録: ${entry.ticker} -> ${rivalTicker}`);
    }
  }
}

const astro = getCompanyMaster("186A");
const astroPeers = new Set(getSameThemeTickers("186A"));
if (!astro || astro.themeId !== "space") {
  errors.push("アストロスケールが宇宙・衛星テーマに分類されていません");
}
for (const ticker of ["9348", "5595", "290A"]) {
  if (!astroPeers.has(ticker)) {
    errors.push(`アストロスケールの宇宙比較候補に ${ticker} が含まれていません`);
  }
}

const requiredRankings = [
  "industry-space",
  "industry-ai",
  "industry-saas",
  "industry-bio",
  "revenue-growth",
  "operating-margin",
  "ocf-improvement",
  "risk-signal",
];
const rankingSlugs = new Set(rankingDefinitions.map((ranking) => ranking.slug));
for (const slug of requiredRankings) {
  if (!rankingSlugs.has(slug)) errors.push(`必須ランキング不足: ${slug}`);
}

const proComponents = [
  "components/company-ai-summary.tsx",
  "components/company-financial-signals.tsx",
  "components/company-earnings-flash.tsx",
  "components/company-peer-comparison.tsx",
  "components/company-pro-boundary-controller.tsx",
];
for (const file of proComponents) {
  const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  if (!content.includes("/api/pro-status")) {
    errors.push(`Pro判定が統一されていません: ${file}`);
  }
}

console.log("\n=== Phase 7 Audit ===");
console.log(`対象企業: ${companies.length}`);
console.log(`会社マスタ: ${coverage.total}`);
console.log(`監修済み: ${coverage.reviewed}`);
console.log(`自動分類: ${coverage.automatic}`);
console.log(`分類カバー率: ${(coverage.coverageRate * 100).toFixed(1)}%`);
console.log(`ランキング数: ${rankingDefinitions.length}`);

if (warnings.length > 0) {
  console.log("\nWarnings:");
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

if (errors.length > 0) {
  console.error("\nPhase 7 audit failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("\nPhase 7 audit passed.");
