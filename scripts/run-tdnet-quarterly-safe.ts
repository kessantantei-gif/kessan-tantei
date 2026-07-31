import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIST_TEMPLATE =
  "https://www.release.tdnet.info/inbs/I_list_001_{yyyymmdd}.html";
const listTemplate = process.env.TDNET_LIST_URL_TEMPLATE || DEFAULT_LIST_TEMPLATE;
const userAgent = "kessan-tantei-tdnet-guard/1.0";
const maxRangeDays = Math.min(400, Math.max(1, Number(process.env.TDNET_MAX_RANGE_DAYS ?? "120")));

type DocumentType =
  | "q1_earnings"
  | "q2_earnings"
  | "q3_earnings"
  | "annual_earnings"
  | "forecast_revision"
  | "dividend_revision"
  | "correction"
  | "other";

type Candidate = {
  sourceDocumentId: string;
  ticker: string;
  title: string;
  documentType: DocumentType;
  quarter: 1 | 2 | 3 | 4 | null;
  xbrlUrl: string | null;
};

type Disclosure = {
  id: string;
  ticker: string;
  title: string;
  document_type: DocumentType;
  source_document_id: string;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
  xbrl_url: string | null;
  raw_payload: unknown;
};

type QuarterlyRow = {
  ticker: string;
  fiscal_period_end: string;
  quarter: number;
  accounting_scope: string;
  revenue: number | null;
  operating_income: number | null;
  ordinary_income: number | null;
  profit_attributable_to_owners: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayJst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function enumerateDates(from: string, to: string) {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    throw new Error(`日付形式が不正です: ${from} - ${to}`);
  }
  if (from > to) throw new Error(`開始日が終了日より後です: ${from} > ${to}`);

  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
    if (dates.length > maxRangeDays) {
      throw new Error(`対象期間が上限${maxRangeDays}日を超えています`);
    }
  }
  return dates;
}

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value: string) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function targetDates() {
  const positionalDate = process.argv.find((value: string) => DATE_PATTERN.test(value));
  const explicitDate = argumentValue("date") ?? positionalDate;
  if (explicitDate) return [explicitDate];

  const from = argumentValue("from");
  const to = argumentValue("to") ?? todayJst();
  if (from) return enumerateDates(from, to);

  const lookback = Math.min(14, Math.max(1, Number(argumentValue("lookback") ?? process.env.TDNET_LOOKBACK_DAYS ?? "3")));
  const today = todayJst();
  return Array.from({ length: lookback }, (_, index) => addDays(today, -index)).reverse();
}

function cleanText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(base: string, href: string) {
  return new URL(href.replace(/&amp;/g, "&"), base).toString();
}

function normalizeTicker(value: string) {
  const match = value.normalize("NFKC").match(/(?:^|\D)([0-9A-Z]{4})(?:0)?(?:\D|$)/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function isNonEarningsNotice(title: string) {
  const normalized = title.normalize("NFKC").replace(/\s+/g, "");
  return (
    /決算短信.*(?:開示|公表|発表).*(?:45日|超える|超過|延期|遅延|延長|予定|時期|変更)/.test(normalized) ||
    /(?:45日|超える|超過|延期|遅延|延長).*(?:決算短信|決算発表)/.test(normalized) ||
    /決算発表.*(?:延期|遅延|変更|予定)/.test(normalized)
  );
}

function classifyTitle(title: string): Pick<Candidate, "documentType" | "quarter"> {
  const normalized = title.normalize("NFKC");
  const isCorrection = /訂正|修正/.test(normalized);

  if (isNonEarningsNotice(normalized)) {
    return { documentType: "other", quarter: null };
  }
  if (/配当予想/.test(normalized)) {
    return { documentType: "dividend_revision", quarter: null };
  }
  if (/業績予想/.test(normalized) && /修正/.test(normalized)) {
    return { documentType: "forecast_revision", quarter: null };
  }
  if (!/決算短信/.test(normalized)) {
    return { documentType: "other", quarter: null };
  }
  if (/第1四半期|第１四半期|1Q|１Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q1_earnings", quarter: 1 };
  }
  if (/第2四半期|第２四半期|中間期|中間決算|2Q|２Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q2_earnings", quarter: 2 };
  }
  if (/第3四半期|第３四半期|3Q|３Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q3_earnings", quarter: 3 };
  }
  return { documentType: isCorrection ? "correction" : "annual_earnings", quarter: 4 };
}

function tdnetListUrl(date: string, page: number) {
  const yyyymmdd = date.replace(/-/g, "");
  const pageText = String(page).padStart(3, "0");
  return listTemplate
    .replace("{date}", date)
    .replace("{yyyymmdd}", yyyymmdd)
    .replace("{page}", pageText)
    .replace(/I_list_\d{3}_/, `I_list_${pageText}_`);
}

async function fetchWithRetry(url: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": userAgent } });
      if (response.status === 404) return response;
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
        return response;
      }
      lastError = new Error(`${url}: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    }
    await sleep(1000 * attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(`${url} の取得に失敗しました`);
}

function parseCandidates(html: string, sourceUrl: string, date: string): Candidate[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const candidates: Candidate[] = [];

  for (const row of rows) {
    const text = cleanText(row);
    const classification = classifyTitle(text);
    if (classification.documentType === "other") continue;

    const ticker = normalizeTicker(text);
    if (!ticker) continue;

    const anchors = [...row.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(
      (match) => ({ href: absoluteUrl(sourceUrl, match[1]), text: cleanText(match[2]) })
    );
    const pdf = anchors.find((anchor) => /\.pdf(?:\?|$)/i.test(anchor.href));
    const xbrl = anchors.find((anchor) => /\.zip(?:\?|$)|xbrl/i.test(anchor.href));
    if (!pdf && !xbrl) continue;

    const title =
      anchors
        .map((anchor) => anchor.text)
        .find((anchorText) => /決算短信|業績予想|配当予想/.test(anchorText)) ?? text;
    if (isNonEarningsNotice(title)) continue;

    const sourceDocumentId =
      (pdf?.href ?? xbrl?.href ?? "").match(/([0-9]{16,})/)?.[1] ??
      Buffer.from(`${ticker}:${date}:${title}`).toString("base64url").slice(0, 48);

    candidates.push({
      sourceDocumentId,
      ticker,
      title,
      xbrlUrl: xbrl?.href ?? null,
      ...classification,
    });
  }

  return [...new Map(candidates.map((candidate) => [candidate.sourceDocumentId, candidate])).values()];
}

async function loadCandidates(date: string) {
  const candidates: Candidate[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const url = tdnetListUrl(date, page);
    const response = await fetchWithRetry(url);
    if (response.status === 404) {
      return { candidates, hasList: page > 1 || candidates.length > 0 };
    }
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    candidates.push(...parseCandidates(await response.text(), url, date));
  }
  throw new Error(`${date}: TDnet一覧が50ページを超えました`);
}

async function loadListedTickers() {
  const tickers = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("ticker")
      .eq("listing_status", "listed")
      .range(from, from + 999);
    if (error) throw new Error(`会社マスタ取得失敗: ${error.message}`);
    for (const row of data ?? []) tickers.add(String(row.ticker));
    if ((data ?? []).length < 1000) break;
  }
  return tickers;
}

function dateBounds(date: string) {
  return {
    start: `${date}T00:00:00+09:00`,
    end: `${addDays(date, 1)}T00:00:00+09:00`,
  };
}

async function loadDisclosures(date: string) {
  const { start, end } = dateBounds(date);
  const { data, error } = await supabaseAdmin
    .from("company_disclosures")
    .select(
      "id, ticker, title, document_type, source_document_id, fiscal_period_end, quarter, accounting_scope, xbrl_url, raw_payload"
    )
    .eq("source", "tdnet")
    .gte("disclosed_at", start)
    .lt("disclosed_at", end)
    .range(0, 999);
  if (error) throw new Error(`開示取得失敗 ${date}: ${error.message}`);
  return (data ?? []) as Disclosure[];
}

async function cleanupMisclassifiedNotices(date: string) {
  const disclosures = await loadDisclosures(date);
  const invalid = disclosures.filter((row) => isNonEarningsNotice(row.title));
  if (invalid.length === 0) return 0;

  for (let offset = 0; offset < invalid.length; offset += 100) {
    const ids = invalid.slice(offset, offset + 100).map((row) => row.id);
    const { error } = await supabaseAdmin.from("company_disclosures").delete().in("id", ids);
    if (error) throw new Error(`誤分類開示削除失敗 ${date}: ${error.message}`);
  }
  return invalid.length;
}

function rawExtractionError(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const value = (rawPayload as Record<string, unknown>).extractionError;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function quarterlyKey(row: Pick<Disclosure, "ticker" | "fiscal_period_end" | "quarter" | "accounting_scope">) {
  return [row.ticker, row.fiscal_period_end, row.quarter, row.accounting_scope ?? "unknown"].join("|");
}

async function loadQuarterlyRows(tickers: string[]) {
  const rows: QuarterlyRow[] = [];
  for (let offset = 0; offset < tickers.length; offset += 40) {
    const chunk = tickers.slice(offset, offset + 40);
    if (chunk.length === 0) continue;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("company_quarterly_financials")
        .select(
          "ticker, fiscal_period_end, quarter, accounting_scope, revenue, operating_income, ordinary_income, profit_attributable_to_owners"
        )
        .in("ticker", chunk)
        .range(from, from + 999);
      if (error) throw new Error(`四半期数値取得失敗: ${error.message}`);
      rows.push(...((data ?? []) as QuarterlyRow[]));
      if ((data ?? []).length < 1000) break;
    }
  }
  return rows;
}

async function latestRawRun(date: string) {
  const { data, error } = await supabaseAdmin
    .from("data_import_runs")
    .select("id, status, started_at, failure_count, error_summary, metadata")
    .eq("import_type", "tdnet_quarterly_daily")
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`取込履歴取得失敗: ${error.message}`);
  return (data ?? []).find((row: { metadata?: unknown }) => {
    const metadata = row.metadata as { dates?: unknown } | null;
    return Array.isArray(metadata?.dates) && metadata.dates.includes(date);
  });
}

function runRawSync(date: string) {
  const result = spawnSync("npm", ["run", "sync:tdnet-quarterly:raw", "--", date], {
    stdio: "inherit",
    env: { ...process.env, TDNET_LOOKBACK_DAYS: "1" },
  });
  return result.status ?? 1;
}

async function auditDate(date: string, candidates: Candidate[], listedTickers: Set<string>) {
  const disclosures = await loadDisclosures(date);
  const registeredCandidates = candidates.filter((candidate) => listedTickers.has(candidate.ticker));
  const unknownCandidates = candidates.filter((candidate) => !listedTickers.has(candidate.ticker));
  const disclosureIds = new Set(disclosures.map((row) => row.source_document_id));
  const missingDisclosures = registeredCandidates.filter(
    (candidate) => !disclosureIds.has(candidate.sourceDocumentId)
  );

  const actualEarnings = disclosures.filter(
    (row) =>
      row.quarter !== null &&
      ["q1_earnings", "q2_earnings", "q3_earnings", "annual_earnings", "correction"].includes(
        row.document_type
      ) &&
      !isNonEarningsNotice(row.title)
  );
  const extractionErrors = actualEarnings
    .map((row) => ({ row, error: rawExtractionError(row.raw_payload) }))
    .filter((item): item is { row: Disclosure; error: string } => item.error !== null);
  const missingPeriod = actualEarnings.filter((row) => row.xbrl_url && !row.fiscal_period_end);

  const tickers = [...new Set(actualEarnings.map((row) => row.ticker))];
  const quarterlyRows = await loadQuarterlyRows(tickers);
  const quarterlyByKey = new Map(
    quarterlyRows.map((row) => [
      [row.ticker, row.fiscal_period_end, row.quarter, row.accounting_scope ?? "unknown"].join("|"),
      row,
    ])
  );
  const requiredKeys = new Set(
    actualEarnings
      .filter((row) => row.fiscal_period_end !== null)
      .map((row) => quarterlyKey(row))
  );
  const missingQuarterlyKeys = [...requiredKeys].filter((key) => !quarterlyByKey.has(key));
  const allCoreMetricsNull = [...requiredKeys]
    .map((key) => quarterlyByKey.get(key))
    .filter(
      (row): row is QuarterlyRow =>
        Boolean(row) &&
        row!.revenue === null &&
        row!.operating_income === null &&
        row!.ordinary_income === null &&
        row!.profit_attributable_to_owners === null
    );

  const problems = [
    ...missingDisclosures.map((row) => `${row.ticker}:${row.sourceDocumentId} 開示未保存`),
    ...extractionErrors.map((item) => `${item.row.ticker}:${item.error}`),
    ...missingPeriod.map((row) => `${row.ticker}:${row.source_document_id} 決算期末日未取得`),
    ...missingQuarterlyKeys.map((key) => `${key} 四半期数値未保存`),
    ...allCoreMetricsNull.map((row) => `${row.ticker}:${row.fiscal_period_end}:Q${row.quarter} 主要数値全欠損`),
  ];

  return {
    date,
    candidates: candidates.length,
    registeredCandidates: registeredCandidates.length,
    unknownCandidates: unknownCandidates.map((row) => row.ticker),
    disclosures: disclosures.length,
    actualEarnings: actualEarnings.length,
    quarterlyRowsMatched: requiredKeys.size - missingQuarterlyKeys.length,
    problems,
  };
}

async function main() {
  const dates = targetDates();
  const listedTickers = await loadListedTickers();
  const reports: Awaited<ReturnType<typeof auditDate>>[] = [];
  const failures: string[] = [];
  let skippedNoList = 0;
  let cleanedNotices = 0;

  for (const date of dates) {
    console.log(`\n===== TDnet guarded sync ${date} =====`);
    try {
      const { candidates, hasList } = await loadCandidates(date);
      if (!hasList) {
        console.log(`${date}: TDnet一覧なし（休日・開示なしとしてスキップ）`);
        skippedNoList += 1;
        continue;
      }

      const rawExitCode = runRawSync(date);
      cleanedNotices += await cleanupMisclassifiedNotices(date);
      const rawRun = await latestRawRun(date);
      if (rawExitCode !== 0 || !rawRun || rawRun.status !== "success") {
        failures.push(
          `${date}: raw sync status=${rawRun?.status ?? "missing"}, exit=${rawExitCode}, summary=${rawRun?.error_summary ?? "none"}`
        );
      }

      const report = await auditDate(date, candidates, listedTickers);
      reports.push(report);
      failures.push(...report.problems.map((problem) => `${date}: ${problem}`));
      console.log(JSON.stringify(report, null, 2));
    } catch (error) {
      failures.push(`${date}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n===== TDnet guarded sync summary =====");
  console.log(
    JSON.stringify(
      {
        dates,
        processedDates: reports.length,
        skippedNoList,
        cleanedMisclassifiedNotices: cleanedNotices,
        reports,
        failures,
      },
      null,
      2
    )
  );

  if (failures.length > 0) {
    throw new Error(`TDnet安全同期で${failures.length}件の問題を検出しました`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
