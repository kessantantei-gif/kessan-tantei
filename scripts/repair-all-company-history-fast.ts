import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { calculateMarketScores } from "../lib/market-scoring-engine";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

const execFileAsync = promisify(execFile);

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

type CalendarFallback = {
  month: number | null;
  day: number | null;
};

type RepairFailure = {
  ticker: string;
  docID: string | null;
  error: string;
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

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}時間${minutes}分${rest}秒`;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildPeriodEnd(year: number, month: number, preferredDay: number | null) {
  const day = Math.min(preferredDay ?? daysInMonth(year, month), daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function pick(source: JsonRow, ...keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
}

function inferCalendar(financials: JsonRow | null): CalendarFallback {
  if (!financials) return { month: null, day: null };
  const periodEnd = validDate(pick(financials, "periodEnd", "period_end"));
  const month =
    positiveInteger(pick(financials, "fiscalMonth", "fiscal_month")) ??
    (periodEnd ? Number(periodEnd.slice(5, 7)) : null);
  const day = periodEnd ? Number(periodEnd.slice(8, 10)) : null;
  return {
    month: month && month >= 1 && month <= 12 ? month : null,
    day: day && day >= 1 && day <= 31 ? day : null,
  };
}

function normalizeHistoryRow(
  source: JsonRow,
  fallback: CalendarFallback,
  fallbackDocID: string | null = null
): HistoryRow | null {
  const sourcePeriodEnd = validDate(pick(source, "periodEnd", "period_end"));
  const sourceYear = positiveInteger(pick(source, "fiscalYear", "fiscal_year", "year"));
  const sourceMonth = positiveInteger(pick(source, "fiscalMonth", "fiscal_month"));
  const fiscalYear = sourceYear ?? (sourcePeriodEnd ? Number(sourcePeriodEnd.slice(0, 4)) : null);
  const fiscalMonth =
    sourceMonth ??
    (sourcePeriodEnd ? Number(sourcePeriodEnd.slice(5, 7)) : null) ??
    fallback.month;

  if (!fiscalYear || fiscalYear < 1900 || !fiscalMonth || fiscalMonth < 1 || fiscalMonth > 12) {
    return null;
  }

  const periodEnd = sourcePeriodEnd ?? buildPeriodEnd(fiscalYear, fiscalMonth, fallback.day);
  const fiscalPeriodValue = pick(source, "fiscalPeriod", "fiscal_period", "period");
  const docIDValue = pick(source, "docID", "docId", "document_id", "doc_id");

  return {
    year: String(fiscalYear),
    fiscalYear,
    fiscalMonth,
    fiscalPeriod:
      typeof fiscalPeriodValue === "string" && fiscalPeriodValue.trim()
        ? fiscalPeriodValue.trim()
        : `${fiscalYear}年${fiscalMonth}月期`,
    periodEnd,
    revenue: finiteNumber(pick(source, "revenue")),
    grossProfit: finiteNumber(pick(source, "grossProfit", "gross_profit")),
    operatingIncome: finiteNumber(pick(source, "operatingIncome", "operating_income")),
    netIncome: finiteNumber(pick(source, "netIncome", "net_income")),
    operatingCF: finiteNumber(pick(source, "operatingCF", "operating_cf")),
    docID: typeof docIDValue === "string" && docIDValue ? docIDValue : fallbackDocID,
  };
}

function metricCount(row: HistoryRow) {
  return [row.revenue, row.grossProfit, row.operatingIncome, row.netIncome, row.operatingCF].filter(
    (value) => value !== null
  ).length;
}

function periodKey(row: HistoryRow) {
  return `${row.fiscalYear}-${String(row.fiscalMonth).padStart(2, "0")}`;
}

function rowPriority(row: HistoryRow) {
  return metricCount(row) * 10 + (row.docID ? 2 : 0) + (row.periodEnd ? 1 : 0);
}

function mergeHistory(rows: HistoryRow[]) {
  const byPeriod = new Map<string, HistoryRow>();
  for (const row of rows) {
    const key = periodKey(row);
    const current = byPeriod.get(key);
    if (!current || rowPriority(row) > rowPriority(current)) byPeriod.set(key, row);
  }
  return [...byPeriod.values()]
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .slice(-3);
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

async function ensureDownloaded(docID: string) {
  if (validZipExists(docID)) return;
  await execFileAsync("npx", ["tsx", "scripts/download-edinet.ts"], {
    env: { ...process.env, DOC_ID: docID },
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function parseDocument(docID: string): Promise<HistoryRow> {
  await ensureDownloaded(docID);
  const financials = parseEdinetFinancials(docID) as unknown as JsonRow;
  const fallback = inferCalendar(financials);
  const normalized = normalizeHistoryRow(financials, fallback, docID);
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
      headers: { "user-agent": "kessan-tantei-history-repair-fast/1.0" },
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

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    })
  );
}

async function saveAnalysis(
  company: CompanyRow,
  analysis: AnalysisRow,
  history: HistoryRow[]
) {
  const financials = analysis.financials ?? {};
  const scores = calculateMarketScores(
    company.market_segment,
    financials as Parameters<typeof calculateMarketScores>[1],
    history as Parameters<typeof calculateMarketScores>[2]
  );

  const { error } = await supabaseAdmin
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
    .eq("ticker", company.ticker);

  if (error) throw new Error(`${company.ticker}: 分析履歴更新失敗: ${error.message}`);
}

async function saveParsedPeriods(company: CompanyRow, rows: HistoryRow[]) {
  for (const row of rows) {
    if (!row.docID) continue;
    const { error: deleteError } = await supabaseAdmin
      .from("company_financial_periods")
      .delete()
      .eq("company_id", company.id)
      .eq("document_id", row.docID);
    if (deleteError) throw new Error(`${company.ticker}: 正規化履歴削除失敗: ${deleteError.message}`);

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
      source_position: 0,
      data_quality: "unreviewed",
      updated_at: new Date().toISOString(),
    });
    if (insertError) throw new Error(`${company.ticker}: 正規化履歴保存失敗: ${insertError.message}`);
  }
}

function documentIndexPath(start: string, end: string) {
  return path.join(process.cwd(), "logs", `history-document-index-${start}-${end}.json`);
}

function loadDocumentIndex(indexPath: string) {
  if (!fs.existsSync(indexPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, EdinetDocument[]>;
    return new Map(Object.entries(parsed));
  } catch {
    return null;
  }
}

function saveDocumentIndex(indexPath: string, index: Map<string, EdinetDocument[]>) {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(Object.fromEntries(index), null, 2));
}

async function main() {
  const end = toDate(parseArgument("end") ?? formatDate(new Date()));
  const days = Math.max(730, Number(parseArgument("days") ?? "950"));
  const repairConcurrency = Math.min(3, Math.max(1, Number(parseArgument("concurrency") ?? "2")));
  const saveConcurrency = Math.min(20, Math.max(1, Number(parseArgument("save-concurrency") ?? "10")));
  const dryRun = process.argv.includes("--dry-run");
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startText = formatDate(start);
  const endText = formatDate(end);

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
  const historyMap = new Map<string, HistoryRow[]>();

  for (const analysis of analyses) {
    const fallback = inferCalendar(analysis.financials);
    const existing = (Array.isArray(analysis.history) ? analysis.history : [])
      .map((row) => normalizeHistoryRow(row, fallback))
      .filter((row): row is HistoryRow => Boolean(row));
    const current = analysis.financials
      ? normalizeHistoryRow(analysis.financials, fallback, analysis.doc_id)
      : null;
    historyMap.set(analysis.ticker, mergeHistory(current ? [...existing, current] : existing));
  }

  const deficient = companies.filter((company) => {
    const analysis = analysisMap.get(company.ticker);
    return Boolean(analysis && company.edinet_code && (historyMap.get(company.ticker)?.length ?? 0) < 2);
  });

  console.log("===== 全社決算履歴・高速修復 =====");
  console.log({
    listedCompanies: companies.length,
    analyses: analyses.length,
    deficientAfterMonthRecovery: deficient.length,
    start: startText,
    end: endText,
    repairConcurrency,
    saveConcurrency,
    dryRun,
  });

  const targetCodes = new Set(
    deficient.map((company) => company.edinet_code).filter((value): value is string => Boolean(value))
  );
  const indexPath = documentIndexPath(startText, endText);
  let documentsByEdinet = loadDocumentIndex(indexPath);

  if (documentsByEdinet) {
    console.log(`書類一覧キャッシュを使用: ${indexPath}`);
  } else {
    documentsByEdinet = new Map<string, EdinetDocument[]>();
    let scanned = 0;
    for (
      let cursor = new Date(end);
      cursor >= start;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
    ) {
      const weekday = cursor.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const date = formatDate(cursor);
      const documents = await fetchDocuments(date);
      scanned += 1;

      for (const document of documents) {
        if (document.docTypeCode !== "120" && document.docTypeCode !== "130") continue;
        if (!targetCodes.has(document.edinetCode)) continue;
        const current = documentsByEdinet.get(document.edinetCode) ?? [];
        if (!current.some((item) => item.docID === document.docID)) current.push(document);
        current.sort((a, b) => (b.submitDateTime ?? "").localeCompare(a.submitDateTime ?? ""));
        documentsByEdinet.set(document.edinetCode, current.slice(0, 8));
      }

      if (scanned % 25 === 0) {
        console.log(`SCAN ${date}: ${scanned}営業日 / ${documentsByEdinet.size}/${deficient.length}社`);
      }
      await sleep(150);
    }
    saveDocumentIndex(indexPath, documentsByEdinet);
    console.log(`書類一覧キャッシュ保存: ${indexPath}`);
  }

  const failures: RepairFailure[] = [];
  const repairedTickers = new Set<string>();
  const repairStartedAt = Date.now();
  let repairCompleted = 0;

  await runPool(deficient, repairConcurrency, async (company) => {
    const analysis = analysisMap.get(company.ticker);
    if (!analysis) return;
    const before = historyMap.get(company.ticker) ?? [];
    const candidates = documentsByEdinet?.get(company.edinet_code ?? "") ?? [];
    const parsedRows: HistoryRow[] = [];

    for (const candidate of candidates) {
      try {
        parsedRows.push(await parseDocument(candidate.docID));
        if (mergeHistory([...before, ...parsedRows]).length >= 3) break;
      } catch (error) {
        failures.push({
          ticker: company.ticker,
          docID: candidate.docID,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const repaired = mergeHistory([...before, ...parsedRows]);
    historyMap.set(company.ticker, repaired);

    if (!dryRun) {
      await saveAnalysis(company, analysis, repaired);
      await saveParsedPeriods(company, parsedRows);
    }
    if (repaired.length >= 2) repairedTickers.add(company.ticker);

    repairCompleted += 1;
    const elapsed = Date.now() - repairStartedAt;
    const eta = (elapsed / Math.max(1, repairCompleted)) * (deficient.length - repairCompleted);
    console.log(
      `[REPAIR ${repairCompleted}/${deficient.length}] ${company.ticker} ${company.company_name} ` +
        `${before.length}期→${repaired.length}期 / 経過 ${formatDuration(elapsed)} / 残り ${formatDuration(eta)}`
    );
  });

  console.log("既存履歴の決算月・決算期を全社へ保存します。");
  let saved = 0;
  const saveStartedAt = Date.now();
  await runPool(analyses, saveConcurrency, async (analysis) => {
    if (repairedTickers.has(analysis.ticker)) {
      saved += 1;
      return;
    }
    const company = companyMap.get(analysis.ticker);
    if (!company) return;
    const history = historyMap.get(analysis.ticker) ?? [];
    if (!dryRun) await saveAnalysis(company, analysis, history);
    saved += 1;
    if (saved % 100 === 0 || saved === analyses.length) {
      const elapsed = Date.now() - saveStartedAt;
      const eta = (elapsed / Math.max(1, saved)) * (analyses.length - saved);
      console.log(`SAVE ${saved}/${analyses.length} / 経過 ${formatDuration(elapsed)} / 残り ${formatDuration(eta)}`);
    }
  });

  let twoPeriodAvailable = 0;
  const unavailable: Array<{ ticker: string; companyName: string; periods: number }> = [];
  for (const analysis of analyses) {
    const periods = historyMap.get(analysis.ticker)?.length ?? 0;
    if (periods >= 2) twoPeriodAvailable += 1;
    else {
      unavailable.push({
        ticker: analysis.ticker,
        companyName: companyMap.get(analysis.ticker)?.company_name ?? "",
        periods,
      });
    }
  }

  const reportDirectory = path.join(process.cwd(), "logs");
  fs.mkdirSync(reportDirectory, { recursive: true });
  const reportPath = path.join(
    reportDirectory,
    `all-company-history-fast-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        listedCompanies: companies.length,
        analyses: analyses.length,
        deficientAfterMonthRecovery: deficient.length,
        repairedFromEdinet: repairedTickers.size,
        twoPeriodAvailable,
        twoPeriodUnavailable: unavailable.length,
        unavailable,
        failures,
        dryRun,
      },
      null,
      2
    )
  );

  console.log("\n===== 高速修復結果 =====");
  console.log({
    listedCompanies: companies.length,
    analyses: analyses.length,
    deficientAfterMonthRecovery: deficient.length,
    repairedFromEdinet: repairedTickers.size,
    twoPeriodAvailable,
    twoPeriodUnavailable: unavailable.length,
    parseFailures: failures.length,
    dryRun,
  });
  console.log("Report:", reportPath);
}

main().catch((error) => {
  console.error("全社決算履歴・高速修復に失敗しました。");
  console.error(error);
  process.exit(1);
});
