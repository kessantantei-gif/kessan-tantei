import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  extractFinancials,
  extractRowsFromEdinetCsvZip,
} from "../lib/edinet-financial-parser";
import { supabaseAdmin } from "../lib/supabase";

type AnalysisRow = {
  ticker: string;
  company_name: string;
  doc_id: string | null;
  financials: Record<string, unknown> | null;
  history: unknown;
};

type CsvRow = Record<string, string>;

const EDINET_BASE = "https://api.edinet-fsa.go.jp/api/v2";
const TARGET_TICKERS = [
  "6080",
  "5016",
  "5076",
  "6758",
  "7203",
  "2656",
  "3350",
] as const;

function field(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return "";
}

function localElement(row: CsvRow) {
  const value = field(row, ["要素ID", "Element ID", "element_id", "Element", "element"]);
  return value.includes(":") ? value.split(":").at(-1) ?? value : value;
}

function label(row: CsvRow) {
  return field(row, ["項目名", "Item Name", "item_name", "name", "Name", "ラベル", "Label"]);
}

function context(row: CsvRow) {
  return field(row, ["コンテキストID", "Context ID", "context", "Context"]);
}

function unit(row: CsvRow) {
  return field(row, ["単位", "Unit", "unit"]);
}

function value(row: CsvRow) {
  return field(row, ["値", "Value", "value", "金額", "Amount", "amount"]);
}

function isRelevant(row: CsvRow) {
  const text = `${localElement(row)} ${label(row)}`;
  return [
    "Revenue",
    "NetSales",
    "OperatingRevenue",
    "ProfitLoss",
    "NetIncome",
    "当期純利益",
    "当期利益",
    "売上高",
    "売上収益",
    "営業収益",
  ].some((keyword) => text.includes(keyword));
}

async function fetchCsvZip(docID: string) {
  const apiKey = process.env.EDINET_API_KEY;
  if (!apiKey) throw new Error("EDINET_API_KEY is missing");

  const response = await fetch(
    `${EDINET_BASE}/documents/${docID}?type=5&Subscription-Key=${apiKey}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(`EDINET CSV fetch failed: ${docID} ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 2).toString() !== "PK") {
    throw new Error(
      `EDINET response is not ZIP: ${docID}, content-type=${response.headers.get("content-type")}, bytes=${buffer.length}`
    );
  }
  return buffer;
}

async function main() {
  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, doc_id, financials, history")
    .in("ticker", [...TARGET_TICKERS])
    .order("ticker", { ascending: true });

  if (error) throw new Error(error.message);

  const results = [];
  for (const analysis of (data ?? []) as AnalysisRow[]) {
    if (!analysis.doc_id) continue;

    const zip = await fetchCsvZip(analysis.doc_id);
    const rows = extractRowsFromEdinetCsvZip(zip) as CsvRow[];
    const extracted = extractFinancials(rows);
    const candidates = rows
      .filter((row) => value(row).trim() && isRelevant(row))
      .map((row) => ({
        element: localElement(row),
        label: label(row),
        context: context(row),
        unit: unit(row),
        value: value(row),
      }));

    results.push({
      ticker: analysis.ticker,
      companyName: analysis.company_name,
      docID: analysis.doc_id,
      storedFinancials: analysis.financials,
      extracted,
      candidates,
    });
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/market-ranking-value-diagnostics.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
    "utf8"
  );

  console.log(`Diagnosed ${results.length} companies`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
