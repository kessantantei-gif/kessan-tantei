import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { calculateMarketScores } from "../lib/market-scoring-engine";
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

type AllMarketCompany = {
  id: string;
  ticker: string;
  company_name: string;
  edinet_code: string | null;
  market_segment: "growth" | "standard" | "prime" | "other";
  industry_name: string | null;
  is_financial: boolean;
  is_reit: boolean;
};

type HistoryRow = {
  year: string;
  fiscalYear: number;
  fiscalMonth: number;
  fiscalPeriod: string;
  periodEnd: string;
  revenue: number;
  operatingIncome: number;
  operatingCF: number;
  docID: string;
  inferredPeriod?: boolean;
};

type PeriodFallback = {
  periodEnd: string;
  fiscalYear: number;
  fiscalMonth: number;
};

const ticker = process.env.TICKER || "";
const companyName = process.env.COMPANY_NAME || ticker;
const docID = process.env.DOC_ID || "";

if (!ticker) throw new Error("TICKER がありません");
if (!docID) throw new Error("DOC_ID がありません");

const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

// 外国会社・JDRのうち、日本企業向けXBRL contextでは決算期を取得できない
// 現在の対象書類だけを明示的に補完する。将来書類へ推測で流用しない。
const PERIOD_FALLBACK_BY_DOC_ID: Record<string, PeriodFallback> = {
  S100XC1A: { periodEnd: "2025-06-30", fiscalYear: 2025, fiscalMonth: 6 },
  S100YCTT: { periodEnd: "2025-12-31", fiscalYear: 2025, fiscalMonth: 12 },
  S100VU1R: { periodEnd: "2024-12-31", fiscalYear: 2024, fiscalMonth: 12 },
  S100YB3Z: { periodEnd: "2025-12-31", fiscalYear: 2025, fiscalMonth: 12 },
};

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
    new Set([...output.matchAll(/S100[A-Z0-9]+/g)].map((match) => match[0]))
  );
}

function calculateOcfNegativeStreak(items: { operatingCF: number }[]) {
  let streak = 0;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].operatingCF < 0) streak += 1;
    else break;
  }
  return streak;
}

function buildHistoryRow(id: string): HistoryRow {
  downloadIfNeeded(id);
  const financials = parseEdinetFinancials(id);
  const fallback = PERIOD_FALLBACK_BY_DOC_ID[id];

  const periodEnd = financials.periodEnd || fallback?.periodEnd;
  const fiscalYear = financials.fiscalYear || fallback?.fiscalYear;
  const fiscalMonth = financials.fiscalMonth || fallback?.fiscalMonth;
  const fiscalPeriod =
    financials.fiscalPeriod ||
    (fallback ? `${fallback.fiscalYear}年${fallback.fiscalMonth}月期` : "");

  if (!periodEnd || !fiscalYear || !fiscalMonth || !fiscalPeriod) {
    throw new Error(`決算期をXBRL contextから取得できません: ${id}`);
  }

  if (fallback && !financials.periodEnd) {
    console.log(`外国会社決算期を明示補完: ${id} -> ${periodEnd}`);
  }

  return {
    year: String(fiscalYear),
    fiscalYear,
    fiscalMonth,
    fiscalPeriod,
    periodEnd,
    revenue: financials.revenue,
    operatingIncome: financials.operatingIncome,
    operatingCF: financials.operatingCF,
    docID: id,
    inferredPeriod: Boolean(fallback && !financials.periodEnd),
  };
}

async function loadAllMarketCompany(): Promise<AllMarketCompany | null> {
  const { data, error } = await supabaseAdmin
    .from("all_market_companies")
    .select(
      "id, ticker, company_name, edinet_code, market_segment, industry_name, is_financial, is_reit"
    )
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) throw new Error(`全市場会社マスタ取得失敗: ${error.message}`);
  return (data as AllMarketCompany | null) ?? null;
}

async function saveNormalizedData(args: {
  company: AllMarketCompany;
  financials: ReturnType<typeof parseEdinetFinancials>;
  history: HistoryRow[];
  scores: ReturnType<typeof calculateMarketScores>;
  redFlags: ReturnType<typeof analyzeRedFlags>;
}) {
  const { company, financials, history, scores, redFlags } = args;
  const now = new Date().toISOString();

  for (const [sourcePosition, row] of history.entries()) {
    const { error: deleteError } = await supabaseAdmin
      .from("company_financial_periods")
      .delete()
      .eq("company_id", company.id)
      .eq("document_id", row.docID);
    if (deleteError) {
      throw new Error(`財務履歴の既存行削除失敗 ${row.docID}: ${deleteError.message}`);
    }

    const { error: insertError } = await supabaseAdmin
      .from("company_financial_periods")
      .insert({
        company_id: company.id,
        fiscal_year: row.fiscalYear,
        period_end: row.periodEnd,
        document_id: row.docID,
        accounting_scope: "consolidated",
        period_type: "annual",
        currency: "JPY",
        financials: row.docID === docID ? financials : row,
        source_payload: row,
        source_position: sourcePosition,
        data_quality: row.inferredPeriod ? "warning" : "unreviewed",
        updated_at: now,
      });
    if (insertError) {
      throw new Error(`財務履歴保存失敗 ${row.docID}: ${insertError.message}`);
    }
  }

  const { error: scoreCloseError } = await supabaseAdmin
    .from("company_score_snapshots")
    .update({ is_current: false })
    .eq("company_id", company.id)
    .eq("is_current", true);
  if (scoreCloseError) throw new Error(`旧スコア終了失敗: ${scoreCloseError.message}`);

  const { error: scoreInsertError } = await supabaseAdmin
    .from("company_score_snapshots")
    .insert({
      company_id: company.id,
      market_segment: company.market_segment,
      scoring_model: scores.scoringModel,
      model_version: scores.modelVersion,
      total_score: scores.totalScore,
      danger_score: redFlags.dangerScore,
      score_breakdown: {
        growth: scores.growthScore,
        quality: scores.qualityScore,
        safety: scores.safetyScore,
        completenessPenalty: scores.completenessPenalty,
      },
      calculation_basis: scores.calculationBasis,
      is_current: true,
      calculated_at: now,
    });
  if (scoreInsertError) throw new Error(`スコア保存失敗: ${scoreInsertError.message}`);

  const { error: riskCloseError } = await supabaseAdmin
    .from("company_risk_snapshots")
    .update({ is_current: false })
    .eq("company_id", company.id)
    .eq("is_current", true);
  if (riskCloseError) throw new Error(`旧リスク終了失敗: ${riskCloseError.message}`);

  const { error: riskInsertError } = await supabaseAdmin
    .from("company_risk_snapshots")
    .insert({
      company_id: company.id,
      risk_model: "danger_v1",
      model_version: "1.0",
      risk_level: redFlags.riskLevel,
      danger_score: redFlags.dangerScore,
      flags: redFlags.flags,
      calculation_basis: {
        source: "analyze-company",
        documentId: docID,
        marketSegment: company.market_segment,
      },
      is_current: true,
      calculated_at: now,
    });
  if (riskInsertError) throw new Error(`リスク保存失敗: ${riskInsertError.message}`);

  const dataQuality =
    company.is_financial || company.is_reit || history.some((row) => row.inferredPeriod)
      ? "warning"
      : "unreviewed";
  const { error: companyUpdateError } = await supabaseAdmin
    .from("all_market_companies")
    .update({
      scoring_model: scores.scoringModel,
      data_quality: dataQuality,
      last_financial_update: now,
      updated_at: now,
    })
    .eq("id", company.id);
  if (companyUpdateError) throw new Error(`会社マスタ更新失敗: ${companyUpdateError.message}`);
}

async function main() {
  const [growthCompany, allMarketCompany] = await Promise.all([
    Promise.resolve(loadGrowthCompany()),
    loadAllMarketCompany(),
  ]);

  const finalCompanyName =
    allMarketCompany?.company_name || growthCompany?.name || companyName;
  const searchName =
    growthCompany?.edinetFilerName ||
    growthCompany?.edinetHint ||
    finalCompanyName;
  const marketSegment = allMarketCompany?.market_segment || "growth";
  const industryType = classifyIndustry(
    allMarketCompany?.industry_name || finalCompanyName
  );

  downloadIfNeeded(docID);

  let historyDocIDs = fetchHistoryDocIDs(searchName);
  if (!historyDocIDs.includes(docID)) historyDocIDs.unshift(docID);
  historyDocIDs = Array.from(new Set(historyDocIDs)).slice(0, 6);

  const parsedHistory: HistoryRow[] = [];
  for (const id of historyDocIDs) {
    try {
      parsedHistory.push(buildHistoryRow(id));
    } catch (error) {
      console.log("history parse failed:", id, error);
    }
  }

  // HISTORY_DOC_IDSは新しい順。最初に現れた書類を保持することで、
  // 同一決算期では最新書類・訂正有報を古い書類で上書きしない。
  const latestByPeriod = new Map<string, HistoryRow>();
  for (const row of parsedHistory) {
    if (!latestByPeriod.has(row.periodEnd)) latestByPeriod.set(row.periodEnd, row);
  }

  const history = Array.from(latestByPeriod.values())
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .slice(-3);

  if (!history.some((row) => row.docID === docID)) {
    throw new Error(`最新書類 ${docID} の決算期を履歴へ反映できませんでした`);
  }

  const financials = parseEdinetFinancials(docID);
  const scores = calculateMarketScores(marketSegment, financials, history);
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
    equityRatio: scores.metrics.equityRatio,
    previousAuditorType,
    currentAuditorType,
  });

  const scoreBreakdown = {
    growth: scores.growthScore,
    quality: scores.qualityScore,
    safety: scores.safetyScore,
    completenessPenalty: scores.completenessPenalty,
  };

  const { error: deleteLegacyError } = await supabaseAdmin
    .from("company_analyses")
    .delete()
    .eq("ticker", ticker);
  if (deleteLegacyError) {
    throw new Error(`既存分析削除失敗 ${ticker}: ${deleteLegacyError.message}`);
  }

  const { error } = await supabaseAdmin.from("company_analyses").insert({
    ticker,
    company_name: finalCompanyName,
    doc_id: docID,
    industry_type: industryType,
    market_segment: marketSegment,
    market_segment_updated_at: new Date().toISOString(),
    score: scores.totalScore,
    danger_score: redFlags.dangerScore,
    risk_level: redFlags.riskLevel,
    financials,
    history,
    risk: redFlags,
    score_breakdown: scoreBreakdown,
  });
  if (error) throw error;

  if (allMarketCompany) {
    await saveNormalizedData({
      company: allMarketCompany,
      financials,
      history,
      scores,
      redFlags,
    });
  }

  console.log("===== Analyze Company DB Save Success =====");
  console.log("Company:", finalCompanyName);
  console.log("Ticker:", ticker);
  console.log("Market:", marketSegment);
  console.log("Scoring Model:", scores.scoringModel, scores.modelVersion);
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