import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { isTdnetActualEarningsDocument } from "../lib/tdnet-document-title";
import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const operationStart = process.env.TDNET_OPERATION_START_DATE ?? "2026-07-25";

type Disclosure = {
  ticker: string;
  title: string;
  source_document_id: string;
  disclosed_at: string;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
  xbrl_url: string | null;
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
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function key(row: {
  ticker: string;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
}) {
  return [row.ticker, row.fiscal_period_end, row.quarter, row.accounting_scope ?? "unknown"].join("|");
}

async function main() {
  const from = argumentValue("from") ?? operationStart;
  const to = argumentValue("to") ?? todayJst();
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw new Error(`監査期間が不正です: ${from} - ${to}`);
  }

  const rows: Disclosure[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("company_disclosures")
      .select(
        "ticker, title, source_document_id, disclosed_at, fiscal_period_end, quarter, accounting_scope, xbrl_url"
      )
      .eq("source", "tdnet")
      .not("quarter", "is", null)
      .gte("disclosed_at", `${from}T00:00:00+09:00`)
      .lt("disclosed_at", `${addDays(to, 1)}T00:00:00+09:00`)
      .order("disclosed_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`TDnet開示取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Disclosure[]));
    if ((data ?? []).length < 1000) break;
  }

  const actualEarnings = rows.filter((row) =>
    isTdnetActualEarningsDocument(row.title, row.xbrl_url)
  );
  const missingXbrl = actualEarnings.filter((row) => !row.xbrl_url);

  const missingTickers = [...new Set(missingXbrl.map((row) => row.ticker))];
  const storedKeys = new Set<string>();
  for (let offset = 0; offset < missingTickers.length; offset += 40) {
    const tickers = missingTickers.slice(offset, offset + 40);
    if (!tickers.length) continue;
    for (let fromRow = 0; ; fromRow += 1000) {
      const { data, error } = await supabaseAdmin
        .from("company_quarterly_financials")
        .select("ticker,fiscal_period_end,quarter,accounting_scope")
        .in("ticker", tickers)
        .range(fromRow, fromRow + 999);
      if (error) throw new Error(`四半期数値取得失敗: ${error.message}`);
      for (const row of data ?? []) {
        storedKeys.add(key(row));
      }
      if ((data ?? []).length < 1000) break;
    }
  }

  const missingXbrlWithStoredFinancials = missingXbrl.filter(
    (row) => row.fiscal_period_end !== null && storedKeys.has(key(row))
  );
  const unresolvedMissingXbrl = missingXbrl.filter(
    (row) => row.fiscal_period_end === null || !storedKeys.has(key(row))
  );

  const report = {
    range: { from, to },
    scannedQuarterlyDisclosures: rows.length,
    actualEarnings: actualEarnings.length,
    xbrlAvailable: actualEarnings.length - missingXbrl.length,
    missingXbrlWithStoredFinancials: missingXbrlWithStoredFinancials.map((row) => ({
      ticker: row.ticker,
      sourceDocumentId: row.source_document_id,
      disclosedAt: row.disclosed_at,
      title: row.title,
    })),
    unresolvedMissingXbrl: unresolvedMissingXbrl.map((row) => ({
      ticker: row.ticker,
      sourceDocumentId: row.source_document_id,
      disclosedAt: row.disclosed_at,
      title: row.title,
    })),
  };

  console.log("===== TDnet XBRL availability audit v3 =====");
  console.log(JSON.stringify(report, null, 2));

  if (unresolvedMissingXbrl.length > 0) {
    throw new Error(
      `実決算短信${unresolvedMissingXbrl.length}件でXBRLリンクも保存済み四半期数値もありません`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
