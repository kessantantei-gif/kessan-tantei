import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const minimumAnalysisCoverage = Number(process.env.MIN_ANALYSIS_COVERAGE ?? "0.9");
const minimumEdinetCoverage = Number(process.env.MIN_EDINET_COVERAGE ?? "0.95");

type Market = "growth" | "standard" | "prime";

type CompanyRow = {
  id: string;
  ticker: string;
  market_segment: Market;
  listing_status: string;
  edinet_code: string | null;
  scoring_model: string;
  is_financial: boolean;
  is_reit: boolean;
  last_financial_update: string | null;
};

type AnalysisRow = {
  ticker: string;
  market_segment: Market | null;
  doc_id: string | null;
  score: number | null;
  danger_score: number | null;
  risk_level: string | null;
  history: unknown;
};

type SnapshotRow = {
  company_id: string;
  scoring_model?: string;
  market_segment?: string;
  is_current: boolean;
};

async function loadAll<T>(
  table: string,
  select: string,
  configure?: (query: any) => any
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

function percentage(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function percentText(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const [companies, analyses, periods, scores, risks] = await Promise.all([
    loadAll<CompanyRow>(
      "all_market_companies",
      "id, ticker, market_segment, listing_status, edinet_code, scoring_model, is_financial, is_reit, last_financial_update",
      (query) => query.eq("listing_status", "listed").in("market_segment", ["growth", "standard", "prime"])
    ),
    loadAll<AnalysisRow>(
      "company_analyses",
      "ticker, market_segment, doc_id, score, danger_score, risk_level, history",
      (query) => query.neq("risk_level", "EXCLUDED")
    ),
    loadAll<{ company_id: string; document_id: string | null }>(
      "company_financial_periods",
      "company_id, document_id"
    ),
    loadAll<SnapshotRow>(
      "company_score_snapshots",
      "company_id, scoring_model, market_segment, is_current",
      (query) => query.eq("is_current", true)
    ),
    loadAll<SnapshotRow>(
      "company_risk_snapshots",
      "company_id, is_current",
      (query) => query.eq("is_current", true)
    ),
  ]);

  const companyByTicker = new Map(companies.map((company) => [company.ticker, company]));
  const latestAnalysisByTicker = new Map<string, AnalysisRow>();
  for (const analysis of analyses) latestAnalysisByTicker.set(analysis.ticker, analysis);

  const periodCompanyIds = new Set(periods.map((period) => period.company_id));
  const scoreByCompany = new Map(scores.map((score) => [score.company_id, score]));
  const riskCompanyIds = new Set(risks.map((risk) => risk.company_id));

  const failures: string[] = [];
  const warnings: string[] = [];

  console.log("\n=== Phase 3-6 全市場データ監査 ===");
  console.log(`上場普通株: ${companies.length}`);
  console.log(`解析ticker: ${latestAnalysisByTicker.size}`);
  console.log(`財務期間行: ${periods.length}`);
  console.log(`現在スコア: ${scores.length}`);
  console.log(`現在リスク: ${risks.length}`);

  for (const market of ["growth", "standard", "prime"] as const) {
    const marketCompanies = companies.filter((company) => company.market_segment === market);
    const edinetLinked = marketCompanies.filter((company) => company.edinet_code).length;
    const analyzed = marketCompanies.filter((company) => latestAnalysisByTicker.has(company.ticker));
    const periodCovered = marketCompanies.filter((company) => periodCompanyIds.has(company.id)).length;
    const scoreCovered = marketCompanies.filter((company) => scoreByCompany.has(company.id)).length;
    const riskCovered = marketCompanies.filter((company) => riskCompanyIds.has(company.id)).length;

    const edinetCoverage = percentage(edinetLinked, marketCompanies.length);
    const analysisCoverage = percentage(analyzed.length, marketCompanies.length);

    console.log(`\n[${market}]`);
    console.log(`対象: ${marketCompanies.length}`);
    console.log(`EDINET: ${edinetLinked} (${percentText(edinetCoverage)})`);
    console.log(`解析: ${analyzed.length} (${percentText(analysisCoverage)})`);
    console.log(`財務期間あり: ${periodCovered}`);
    console.log(`現在スコアあり: ${scoreCovered}`);
    console.log(`現在リスクあり: ${riskCovered}`);

    if (marketCompanies.length === 0) failures.push(`${market}: 対象会社が0件`);
    if (edinetCoverage < minimumEdinetCoverage) {
      failures.push(
        `${market}: EDINET紐付け率 ${percentText(edinetCoverage)} < ${percentText(minimumEdinetCoverage)}`
      );
    }
    if (analysisCoverage < minimumAnalysisCoverage) {
      failures.push(
        `${market}: 解析率 ${percentText(analysisCoverage)} < ${percentText(minimumAnalysisCoverage)}`
      );
    }

    const analyzedIds = new Set(analyzed.map((analysis) => companyByTicker.get(analysis.ticker)?.id).filter(Boolean));
    const missingPeriods = [...analyzedIds].filter((id) => !periodCompanyIds.has(id as string));
    const missingScores = [...analyzedIds].filter((id) => !scoreByCompany.has(id as string));
    const missingRisks = [...analyzedIds].filter((id) => !riskCompanyIds.has(id as string));

    if (missingPeriods.length > 0) failures.push(`${market}: 解析済みだが財務期間なし ${missingPeriods.length}件`);
    if (missingScores.length > 0) failures.push(`${market}: 解析済みだが現在スコアなし ${missingScores.length}件`);
    if (missingRisks.length > 0) failures.push(`${market}: 解析済みだが現在リスクなし ${missingRisks.length}件`);
  }

  const duplicateAnalysisCounts = new Map<string, number>();
  for (const analysis of analyses) {
    duplicateAnalysisCounts.set(
      analysis.ticker,
      (duplicateAnalysisCounts.get(analysis.ticker) ?? 0) + 1
    );
  }
  const duplicateTickers = [...duplicateAnalysisCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateTickers.length > 0) {
    warnings.push(`company_analysesに複数行あるticker: ${duplicateTickers.length}件`);
  }

  const wrongModels = companies.filter((company) => {
    const score = scoreByCompany.get(company.id);
    if (!score) return false;
    return score.scoring_model !== `${company.market_segment}_v1`;
  });
  if (wrongModels.length > 0) {
    failures.push(`市場とスコアモデル不一致: ${wrongModels.length}件`);
  }

  const unsupported = companies.filter((company) => company.is_financial || company.is_reit);
  if (unsupported.length > 0) {
    warnings.push(`金融・REITの専用モデル確認対象: ${unsupported.length}件`);
  }

  for (const warning of warnings) console.warn(`WARNING: ${warning}`);

  if (failures.length > 0) {
    console.error("\nPhase 3-6 全市場データ監査: FAILED");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("\nPhase 3-6 全市場データ監査: PASSED");
}

main().catch((error) => {
  console.error("Phase 3-6監査で例外が発生しました。", error);
  process.exit(1);
});
