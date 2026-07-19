import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { calculateMarketScores } from "../lib/market-scoring-engine";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type JsonRow = Record<string, unknown>;

type CompanyRow = {
  id: string;
  ticker: string;
  company_name: string;
  edinet_code: string | null;
  market_segment: "prime" | "standard" | "growth" | "other";
};

type AnalysisRow = {
  ticker: string;
  doc_id: string | null;
  financials: JsonRow | null;
  history: JsonRow[] | null;
};

type EdinetDocument = {
  docID: string;
  edinetCode: string;
  docTypeCode: string;
  submitDateTime?: string;
};

type HistoryRow = {
  year: string;
  fiscalYear: number;
  fiscalMonth: number;
  fiscalPeriod: string;
  periodEnd: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  operatingCF: number | null;
  docID: string | null;
};

const apiKey = process.env.EDINET_API_KEY;
if (!apiKey) throw new Error("EDINET_API_KEY missing");

function parseArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDate(value: string) {
  const result = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(result.getTime())) throw new Error(`日付形式が不正です: ${value}`);
  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? value : null;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildPeriodEnd(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

function normalizeHistoryRow(source: JsonRow, fallbackDocID: string | null = null): HistoryRow | null {
  const sourcePeriodEnd = validDate(source.periodEnd ?? source.period_end);
  const sourceYear = numberValue(source.fiscalYear ?? source.fiscal_year ?? source.year);
  const sourceMonth = numberValue(source.fiscalMonth ?? source.fiscal_month);
  const fiscalYear = sourceYear ?? (sourcePeriodEnd ? Number(sourcePeriodEnd.slice(0, 4)) : null);
  const fiscalMonth = sourceMonth ?? (sourcePeriodEnd ? Number(sourcePeriodEnd.slice(5, 7)) : null);

  if (!fiscalYear || !fiscalMonth || fiscalMonth < 1 || fiscalMonth > 12) return null;

  const periodEnd = sourcePeriodEnd ?? buildPeriodEnd(fiscalYear, fiscalMonth);
  return {
    year: String(fiscalYear),
    fiscalYear,
    fiscalMonth,
    fiscalPeriod:
      (typeof source.fiscalPeriod === "string" && source.fiscalPeriod) ||
      (typeof source.fiscal_period === "string" && source.fiscal_period) ||
      `${fiscalYear}年${fiscalMonth}月期`,
    periodEnd,
    revenue: finite(source.revenue),
    grossProfit: finite(source.grossProfit),
    operatingIncome: finite(source.operatingIncome),
    netIncome: finite(source.netIncome),
    operatingCF: finite(source.operatingCF),
    docID:
      (typeof source.docID === "string" && source.docID) ||
      (typeof source.document_id === "string" && source.document_id) ||
      fallbackDocID,
  };
}

function periodKey(row: HistoryRow) {
  return `${row.fiscalYear}-${String(row.fiscalMonth).padStart(2, "0")}`;
}

function metricCount(row: HistoryRow) {
  return [row.revenue, row.grossProfit, row.operatingIncome, row.netIncome, row.operatingCF].filter(
    (value) => value !== null
  ).length;
}

function mergeHistory(rows: HistoryRow[]) {
  const byPeriod = new Map<string, HistoryRow>();

  for (const row of rows) {
    const key = periodKey(row);
    const current = byPeriod.get(key);
    if (!current || metricCount(row) > metricCount(current)) byPeriod.set(key, row);
  }

  return [...byPeriod.values()]
    .filter((row) => row.fiscalYear >= 1900 && row.fiscalMonth >= 1 && row.fiscalMonth <= 12)
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .slice(-3);
}

function currentFinancialHistory(financials: JsonRow | null, docID: string | null) {
  if (!financials) return null;
  return normalizeHistoryRow(financials, docID);
}

function zipPath(docID: string) {
  return path.join(process.cwd(), "downloads", `${docID}.zip`);
}

function validZipExists(docID: string) {
  const target = zipPath(docID);
  if (!fs.existsSync(target)) return false;
  const buffer = fs.readFileSync(target);
  return buffer.length > 4 && buffer.subarray(0, 2).toString() === "PK";
}

function ensureDownloaded(docID: string) {
  if (validZipExists(docID)) return;
  execFileSync("npx", ["tsx", "scripts/download-edinet.ts"], {
    stdio: "pipe",
    env: { ...process.env, DOC_ID: docID },
  });
}

function parseDocument(docID: string): HistoryRow {
  ensureDownloaded(docID);
  const financials = parseEdinetFinancials(docID);
  const normalized = normalizeHistoryRow(financials as unknown as JsonRow, docID);
  if (!normalized) throw new Error(`決算期を取得できません: ${docID}`);
  return normalized;
}

async function fetchDocuments(date: string): Promise<EdinetDocument[]> {
  const url = new URL("https://disclosure.edinet-fsa.go.jp/api/v2/documents.json");
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", apiKey!);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": "kessan-tantei-history-repair/1.0" },
    });
    if (response.ok) {
      const json = (await response.json()) as { results?: EdinetDocument[] };
      return Array.isArray(json.results) ? json.results : [];
    }
    if (attempt === 5) {
      throw new Error(`${date}: EDINET書類一覧取得失敗 ${response.status} ${response.statusText}`);
    }
    await sleep(attempt * 2000);
  }
  return [];
}

async function updateNormalizedPeriods(company: CompanyRow, history: HistoryRow[]) {
  for (const [sourcePosition, row] of history.entries()) {
    if (!row.docID) continue;

    const { error: deleteError } = await supabaseAdmin
      .from("company_financial_periods")
      .delete()
      .eq("company_id", company.id)
      .eq("document_id", row.docID);
    if (deleteError) throw new Error(`${company.ticker}: 履歴既存行削除失敗: ${deleteError.message}`);

    const { error: insertError } = await supabaseAdmin.from("company_financial_periods").insert({
      company_id: company.id,
      fiscal_year: row.fiscalYear,
      period_end: row.periodEnd,
      document_id: row.docID,
      accounting_scope: "consolidated",
      period_type: "annual",
      currency: "JPY",
      financials: row,
      source_payload: row,
      source_position: sourcePosition,
      data_quality: "unreviewed",
      updated_at: new Date().toISOString(),
    });
    if (insertError) throw new Error(`${company.ticker}: 履歴保存失敗: ${insertError.message}`);
  }
}

async function main() {
  const end = toDate(parseArgument("end") ?? formatDate(new Date()));
  const days = Math.max(730, Number(parseArgument("days") ?? "950"));
  const dryRun = process.argv.includes("--dry-run");
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const [companies, analyses] = await Promise.all([
    loadAllSupabaseRows<CompanyRow>("全上場会社取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("id, ticker, company_name, edinet_code, market_segment")
        .eq("listing_status", "listed")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<AnalysisRow>("全分析取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, doc_id, financials, history")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
  ]);

  const companyMap = new Map(companies.map((company) => [company.ticker, company]));
  const analysisMap = new Map(analyses.map((analysis) => [analysis.ticker, analysis]));

  const baseHistoryMap = new Map<string, HistoryRow[]>();
  const deficientCompanies: CompanyRow[] = [];

  for (const company of companies) {
    const analysis = analysisMap.get(company.ticker);
    if (!analysis) continue;

    const existingRows = (Array.isArray(analysis.history) ? analysis.history : [])
      .map((row) => normalizeHistoryRow(row))
      .filter((row): row is HistoryRow => Boolean(row));
    const current = currentFinancialHistory(analysis.financials, analysis.doc_id);
    const merged = mergeHistory(current ? [...existingRows, current] : existingRows);
    baseHistoryMap.set(company.ticker, merged);
    if (merged.length < 2 && company.edinet_code) deficientCompanies.push(company);
  }

  const deficientEdinetCodes = new Set(
    deficientCompanies.map((company) => company.edinet_code).filter((value): value is string => Boolean(value))
  );
  const documentsByEdinet = new Map<string, EdinetDocument[]>();

  console.log("===== 全社決算履歴修復 =====");
  console.log({
    listedCompanies: companies.length,
    analyses: analyses.length,
    deficientBeforeEdinet: deficientCompanies.length,
    start: formatDate(start),
    end: formatDate(end),
    dryRun,
  });

  let scannedBusinessDays = 0;
  for (
    let cursor = new Date(end);
    cursor >= start;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  ) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    const date = formatDate(cursor);
    const documents = await fetchDocuments(date);
    scannedBusinessDays += 1;

    for (const document of documents) {
      if (document.docTypeCode !== "120" && document.docTypeCode !== "130") continue;
      if (!deficientEdinetCodes.has(document.edinetCode)) continue;

      const current = documentsByEdinet.get(document.edinetCode) ?? [];
      if (!current.some((item) => item.docID === document.docID)) current.push(document);
      current.sort((a, b) => (b.submitDateTime ?? "").localeCompare(a.submitDateTime ?? ""));
      documentsByEdinet.set(document.edinetCode, current.slice(0, 8));
    }

    if (scannedBusinessDays % 25 === 0) {
      console.log(`SCAN ${date}: ${scannedBusinessDays}営業日 / ${documentsByEdinet.size}/${deficientCompanies.length}社`);
    }
    await sleep(150);
  }

  const parseFailures: Array<{ ticker: string; docID: string; error: string }> = [];
  let recoverable = 0;

  for (const company of deficientCompanies) {
    const candidates = documentsByEdinet.get(company.edinet_code ?? "") ?? [];
    const parsedRows: HistoryRow[] = [];

    for (const candidate of candidates) {
      try {
        parsedRows.push(parseDocument(candidate.docID));
        if (mergeHistory([...baseHistoryMap.get(company.ticker) ?? [], ...parsedRows]).length >= 3) break;
      } catch (error) {
        parseFailures.push({
          ticker: company.ticker,
          docID: candidate.docID,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const repaired = mergeHistory([...(baseHistoryMap.get(company.ticker) ?? []), ...parsedRows]);
    baseHistoryMap.set(company.ticker, repaired);
    if (repaired.length >= 2) recoverable += 1;
  }

  let updatedCompanies = 0;
  let twoPeriodAvailable = 0;
  let twoPeriodUnavailable = 0;
  const unavailable: Array<{ ticker: string; companyName: string; periods: number }> = [];

  for (const analysis of analyses) {
    const company = companyMap.get(analysis.ticker);
    if (!company) continue;

    const history = baseHistoryMap.get(analysis.ticker) ?? [];
    if (history.length >= 2) twoPeriodAvailable += 1;
    else {
      twoPeriodUnavailable += 1;
      unavailable.push({
        ticker: company.ticker,
        companyName: company.company_name,
        periods: history.length,
      });
    }

    if (dryRun) continue;

    const financials = analysis.financials ?? {};
    const scores = calculateMarketScores(
      company.market_segment,
      financials as Parameters<typeof calculateMarketScores>[1],
      history as Parameters<typeof calculateMarketScores>[2]
    );

    const { error: updateError } = await supabaseAdmin
      .from("company_analyses")
      .update({
        history,
        score: scores.totalScore,
        score_breakdown: {
          growth: scores.growthScore,
          quality: scores.qualityScore,
          safety: scores.safetyScore,
          completenessPenalty: scores.completenessPenalty,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("ticker", analysis.ticker);
    if (updateError) throw new Error(`${analysis.ticker}: 分析履歴更新失敗: ${updateError.message}`);

    await updateNormalizedPeriods(company, history);
    updatedCompanies += 1;
    if (updatedCompanies % 100 === 0) console.log(`UPDATE ${updatedCompanies}/${analyses.length}`);
  }

  const reportDirectory = path.join(process.cwd(), "logs");
  fs.mkdirSync(reportDirectory, { recursive: true });
  const reportPath = path.join(
    reportDirectory,
    `all-company-history-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        listedCompanies: companies.length,
        analyses: analyses.length,
        scannedBusinessDays,
        deficientBeforeEdinet: deficientCompanies.length,
        recoverable,
        updatedCompanies,
        twoPeriodAvailable,
        twoPeriodUnavailable,
        unavailable,
        parseFailures,
      },
      null,
      2
    )
  );

  console.log("\n===== 修復結果 =====");
  console.log({
    listedCompanies: companies.length,
    analyses: analyses.length,
    scannedBusinessDays,
    deficientBeforeEdinet: deficientCompanies.length,
    recoverable,
    updatedCompanies,
    twoPeriodAvailable,
    twoPeriodUnavailable,
    parseFailures: parseFailures.length,
    dryRun,
  });
  console.log("Report:", reportPath);
}

main().catch((error) => {
  console.error("全社決算履歴修復に失敗しました。");
  console.error(error);
  process.exit(1);
});
