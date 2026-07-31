import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { classifyTdnetTitle, type TdnetDocumentType } from "../lib/tdnet-document-title";
import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIST_TEMPLATE =
  "https://www.release.tdnet.info/inbs/I_list_001_{yyyymmdd}.html";
const listTemplate = process.env.TDNET_LIST_URL_TEMPLATE || DEFAULT_LIST_TEMPLATE;
const userAgent = "kessan-tantei-tdnet-guard-v2/1.0";
const maxRangeDays = Math.min(400, Math.max(1, Number(process.env.TDNET_MAX_RANGE_DAYS ?? "120")));

type Candidate = {
  sourceDocumentId: string;
  ticker: string;
  title: string;
  documentType: TdnetDocumentType;
  quarter: 1 | 2 | 3 | 4 | null;
  xbrlUrl: string | null;
};

type Disclosure = {
  source_document_id: string;
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
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw new Error(`対象期間が不正です: ${from} - ${to}`);
  }

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
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function targetDates() {
  const positionalDate = process.argv.find((value) => DATE_PATTERN.test(value));
  const explicitDate = argumentValue("date") ?? positionalDate;
  if (explicitDate) return [explicitDate];

  const from = argumentValue("from");
  const to = argumentValue("to") ?? todayJst();
  if (from) return enumerateDates(from, to);

  const lookback = Math.min(
    14,
    Math.max(1, Number(argumentValue("lookback") ?? process.env.TDNET_LOOKBACK_DAYS ?? "3"))
  );
  const today = todayJst();
  return Array.from({ length: lookback }, (_, index) => addDays(today, -(lookback - 1 - index)));
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
      if (response.status === 404 || response.ok) return response;
      lastError = new Error(`${url}: HTTP ${response.status}`);
      if (![429, 500, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    }
    await sleep(attempt * 1_000);
  }
  throw lastError instanceof Error ? lastError : new Error(`${url} の取得に失敗しました`);
}

function parseCandidates(html: string, sourceUrl: string, date: string) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const candidates: Candidate[] = [];

  for (const row of rows) {
    const rowText = cleanText(row);
    const ticker = normalizeTicker(rowText);
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
        .find((anchorText) => /決算短信|業績予想|配当予想/.test(anchorText)) ?? rowText;
    const classification = classifyTdnetTitle(title, xbrl?.href ?? null);
    if (classification.documentType === "other") continue;

    const sourceDocumentId =
      (pdf?.href ?? xbrl?.href ?? "").match(/([0-9]{16,})/)?.[1] ??
      Buffer.from(`${ticker}:${date}:${title}`).toString("base64url").slice(0, 48);

    candidates.push({
      sourceDocumentId,
      ticker,
      title,
      documentType: classification.documentType,
      quarter: classification.quarter,
      xbrlUrl: xbrl?.href ?? null,
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

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  return result.status ?? 1;
}

async function latestRawRun(date: string) {
  const { data, error } = await supabaseAdmin
    .from("data_import_runs")
    .select("status, started_at, error_summary, metadata")
    .eq("import_type", "tdnet_quarterly_daily")
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`取込履歴取得失敗: ${error.message}`);

  return (data ?? []).find((row) => {
    const metadata = row.metadata as { dates?: unknown } | null;
    return Array.isArray(metadata?.dates) && metadata.dates.includes(date);
  });
}

async function loadDisclosureIds(date: string) {
  const { data, error } = await supabaseAdmin
    .from("company_disclosures")
    .select("source_document_id")
    .eq("source", "tdnet")
    .gte("disclosed_at", `${date}T00:00:00+09:00`)
    .lt("disclosed_at", `${addDays(date, 1)}T00:00:00+09:00`)
    .range(0, 999);
  if (error) throw new Error(`開示取得失敗 ${date}: ${error.message}`);
  return new Set(((data ?? []) as Disclosure[]).map((row) => row.source_document_id));
}

async function main() {
  const dates = targetDates();
  const listedTickers = await loadListedTickers();
  const failures: string[] = [];
  const reports: Array<Record<string, unknown>> = [];

  for (const date of dates) {
    console.log(`\n===== TDnet guarded sync v2 ${date} =====`);
    try {
      const { candidates, hasList } = await loadCandidates(date);
      if (!hasList) {
        reports.push({ date, status: "no-list" });
        continue;
      }

      const rawExit = run("npm", ["run", "sync:tdnet-quarterly:raw", "--", date]);
      const rawRun = await latestRawRun(date);
      if (rawExit !== 0 || !rawRun || rawRun.status !== "success") {
        failures.push(
          `${date}: raw status=${rawRun?.status ?? "missing"}, exit=${rawExit}, summary=${rawRun?.error_summary ?? "none"}`
        );
      }

      const registered = candidates.filter((candidate) => listedTickers.has(candidate.ticker));
      const unknown = candidates.filter((candidate) => !listedTickers.has(candidate.ticker));
      const disclosureIds = await loadDisclosureIds(date);
      const missing = registered.filter(
        (candidate) => !disclosureIds.has(candidate.sourceDocumentId)
      );
      failures.push(
        ...missing.map(
          (candidate) => `${date}: ${candidate.ticker}:${candidate.sourceDocumentId} 開示未保存`
        )
      );

      const ingestionAuditExit = run("npm", [
        "run",
        "audit:tdnet-ingestion",
        "--",
        `--from=${date}`,
        `--to=${date}`,
      ]);
      if (ingestionAuditExit !== 0) failures.push(`${date}: DB取込監査失敗`);

      const xbrlAuditExit = run("npm", [
        "run",
        "audit:tdnet-xbrl",
        "--",
        `--from=${date}`,
        `--to=${date}`,
      ]);
      if (xbrlAuditExit !== 0) failures.push(`${date}: XBRLリンク監査失敗`);

      reports.push({
        date,
        candidates: candidates.length,
        registeredCandidates: registered.length,
        unknownTickers: [...new Set(unknown.map((candidate) => candidate.ticker))],
        missingDisclosures: missing.length,
        rawStatus: rawRun?.status ?? null,
      });
    } catch (error) {
      failures.push(`${date}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n===== TDnet guarded sync v2 summary =====");
  console.log(JSON.stringify({ dates, reports, failures }, null, 2));

  if (failures.length > 0) {
    throw new Error(`TDnet安全同期で${failures.length}件の問題を検出しました`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
