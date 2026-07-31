import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { writeFile } from "node:fs/promises";
import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const operationStart = process.env.TDNET_OPERATION_START_DATE ?? "2026-07-25";

type Disclosure = {
  id: string;
  ticker: string;
  title: string;
  document_type: string;
  source_document_id: string;
  disclosed_at: string;
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
  operating_cf: number | null;
};

function todayJst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value: string) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function dateRange() {
  const from = argumentValue("from") ?? operationStart;
  const to = argumentValue("to") ?? todayJst();
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw new Error(`監査期間が不正です: ${from} - ${to}`);
  }
  return { from, to };
}

function isNonEarningsNotice(title: string) {
  const normalized = title.normalize("NFKC").replace(/\s+/g, "");
  return (
    /決算短信.*(?:開示|公表|発表).*(?:45日|超える|超過|延期|遅延|延長|予定|時期|変更)/.test(normalized) ||
    /(?:45日|超える|超過|延期|遅延|延長).*(?:決算短信|決算発表)/.test(normalized) ||
    /決算発表.*(?:延期|遅延|変更|予定)/.test(normalized)
  );
}

function rawExtractionError(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const value = (rawPayload as Record<string, unknown>).extractionError;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function key(row: {
  ticker: string;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
}) {
  return [row.ticker, row.fiscal_period_end, row.quarter, row.accounting_scope ?? "unknown"].join("|");
}

async function loadDisclosures(from: string, to: string) {
  const rows: Disclosure[] = [];
  const start = `${from}T00:00:00+09:00`;
  const end = `${addDays(to, 1)}T00:00:00+09:00`;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("company_disclosures")
      .select(
        "id, ticker, title, document_type, source_document_id, disclosed_at, fiscal_period_end, quarter, accounting_scope, xbrl_url, raw_payload"
      )
      .eq("source", "tdnet")
      .gte("disclosed_at", start)
      .lt("disclosed_at", end)
      .order("disclosed_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`TDnet開示取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Disclosure[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function loadQuarterlyRows(tickers: string[]) {
  const rows: QuarterlyRow[] = [];
  for (let offset = 0; offset < tickers.length; offset += 40) {
    const chunk = tickers.slice(offset, offset + 40);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("company_quarterly_financials")
        .select(
          "ticker, fiscal_period_end, quarter, accounting_scope, revenue, operating_income, ordinary_income, profit_attributable_to_owners, operating_cf"
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

async function main() {
  const { from, to } = dateRange();
  const disclosures = await loadDisclosures(from, to);
  const misclassifiedNotices = disclosures.filter((row) => isNonEarningsNotice(row.title));
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
  const quarterlyByKey = new Map(quarterlyRows.map((row) => [key(row), row]));
  const requiredKeys = new Set(
    actualEarnings.filter((row) => row.fiscal_period_end !== null).map((row) => key(row))
  );
  const missingQuarterlyKeys = [...requiredKeys].filter((value) => !quarterlyByKey.has(value));
  const allCoreMetricsNull = [...requiredKeys]
    .map((value) => quarterlyByKey.get(value))
    .filter(
      (row): row is QuarterlyRow =>
        Boolean(row) &&
        row!.revenue === null &&
        row!.operating_income === null &&
        row!.ordinary_income === null &&
        row!.profit_attributable_to_owners === null
    );

  const metricAvailability = {
    revenue: [...requiredKeys].filter((value) => quarterlyByKey.get(value)?.revenue != null).length,
    operatingIncome: [...requiredKeys].filter(
      (value) => quarterlyByKey.get(value)?.operating_income != null
    ).length,
    ordinaryIncome: [...requiredKeys].filter(
      (value) => quarterlyByKey.get(value)?.ordinary_income != null
    ).length,
    profitAttributableToOwners: [...requiredKeys].filter(
      (value) => quarterlyByKey.get(value)?.profit_attributable_to_owners != null
    ).length,
    operatingCF: [...requiredKeys].filter((value) => quarterlyByKey.get(value)?.operating_cf != null).length,
  };

  const problems = [
    ...misclassifiedNotices.map((row) => `${row.ticker}:${row.source_document_id} 誤分類通知が残存`),
    ...extractionErrors.map((item) => `${item.row.ticker}:${item.row.source_document_id} ${item.error}`),
    ...missingPeriod.map((row) => `${row.ticker}:${row.source_document_id} 決算期末日未取得`),
    ...missingQuarterlyKeys.map((value) => `${value} 四半期数値未保存`),
    ...allCoreMetricsNull.map((row) => `${row.ticker}:${row.fiscal_period_end}:Q${row.quarter} 主要数値全欠損`),
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    range: { from, to },
    disclosures: disclosures.length,
    actualEarnings: actualEarnings.length,
    requiredQuarterlyKeys: requiredKeys.size,
    matchedQuarterlyKeys: requiredKeys.size - missingQuarterlyKeys.length,
    metricAvailability,
    misclassifiedNotices: misclassifiedNotices.map((row) => ({
      ticker: row.ticker,
      sourceDocumentId: row.source_document_id,
      title: row.title,
    })),
    extractionErrors: extractionErrors.map((item) => ({
      ticker: item.row.ticker,
      sourceDocumentId: item.row.source_document_id,
      error: item.error,
    })),
    missingPeriod: missingPeriod.map((row) => ({
      ticker: row.ticker,
      sourceDocumentId: row.source_document_id,
    })),
    missingQuarterlyKeys,
    allCoreMetricsNull: allCoreMetricsNull.map((row) => ({
      ticker: row.ticker,
      fiscalPeriodEnd: row.fiscal_period_end,
      quarter: row.quarter,
    })),
    problems,
  };

  console.log("===== TDnet ingestion audit =====");
  console.log(JSON.stringify(report, null, 2));

  const reportPath = process.env.TDNET_AUDIT_REPORT_PATH;
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (problems.length > 0) {
    throw new Error(`TDnet取込監査で${problems.length}件の未解決問題を検出しました`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
