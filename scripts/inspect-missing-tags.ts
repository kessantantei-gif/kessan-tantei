import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";

type EdinetDocument = {
  docID: string;
  secCode?: string;
  filerName?: string;
  docDescription?: string;
};

const EDINET_BASE = "https://api.edinet-fsa.go.jp/api/v2";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const edinetKey = process.env.EDINET_API_KEY;

if (!supabaseUrl || !supabaseKey || !edinetKey) {
  console.log("SUPABASE_URL =", !!supabaseUrl);
  console.log("SUPABASE_SERVICE_ROLE_KEY =", !!supabaseKey);
  console.log("EDINET_API_KEY =", !!edinetKey);
  throw new Error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / EDINET_API_KEY を確認してください"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

function parseLine(line: string) {
  const delimiter = line.includes("\t") ? "\t" : ",";
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);

  return result.map((v) => v.replace(/^"|"$/g, ""));
}

function parseTable(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

function getField(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return "";
}

function rowElement(row: Record<string, string>) {
  return getField(row, ["要素ID", "Element ID"]);
}

function rowName(row: Record<string, string>) {
  return getField(row, ["項目名", "Item Name"]);
}

function rowContext(row: Record<string, string>) {
  return getField(row, ["コンテキストID", "Context ID"]);
}

function rowValue(row: Record<string, string>) {
  return getField(row, ["値", "Value"]);
}

function rowUnit(row: Record<string, string>) {
  return getField(row, ["単位", "Unit"]);
}

function parseNumber(value: string) {
  if (!value) return 0;

  const normalized = value
    .replace(/,/g, "")
    .replace(/△/g, "-")
    .replace(/▲/g, "-")
    .replace(/−/g, "-")
    .replace(/－/g, "-")
    .trim();

  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function scaledValue(row: Record<string, string>) {
  let value = parseNumber(rowValue(row));
  const unit = rowUnit(row);

  if (unit.includes("百万円")) value *= 1_000_000;
  if (unit.includes("千円")) value *= 1_000;

  return value;
}

function normalize(row: Record<string, string>) {
  return `${rowElement(row)} ${rowName(row)} ${rowContext(row)}`.toLowerCase();
}

function findCandidates(rows: Record<string, string>[], keywords: string[]) {
  return rows
    .filter((row) => {
      const text = normalize(row);
      return keywords.some((keyword) =>
        text.includes(keyword.toLowerCase())
      );
    })
    .map((row) => ({
      element: rowElement(row),
      name: rowName(row),
      context: rowContext(row),
      unit: rowUnit(row),
      value: scaledValue(row),
    }))
    .slice(0, 20);
}

async function fetchDocuments(date: string) {
  const url = `${EDINET_BASE}/documents.json?date=${date}&type=2&Subscription-Key=${edinetKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`EDINET fetch failed ${res.status}`);
  }

  const json = await res.json();
  return (json.results ?? []) as EdinetDocument[];
}

async function findLatestDoc(ticker: string) {
  for (let i = 0; i < 180; i++) {
    const date = daysAgo(i);
    const docs = await fetchDocuments(date);

    const found = docs.find((doc) => {
      const secCode = doc.secCode?.slice(0, 4);
      const desc = doc.docDescription ?? "";

      return (
        secCode === ticker &&
        (desc.includes("有価証券報告書") ||
          desc.includes("四半期報告書") ||
          desc.includes("半期報告書"))
      );
    });

    if (found) {
      return { date, doc: found };
    }
  }

  return null;
}

async function fetchCsvRows(docID: string) {
  const url = `${EDINET_BASE}/documents/${docID}?type=5&Subscription-Key=${edinetKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`CSV fetch failed ${docID}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);

  const target = zip
    .getEntries()
    .find((entry) => entry.entryName.includes("jpcrp030000"));

  if (!target) {
    throw new Error("jpcrp030000 CSV not found");
  }

  const buf = target.getData();

  let text = buf.toString("utf8");
  if (text.includes("�")) {
    text = buf.toString("utf16le");
  }

  return parseTable(text);
}

async function getProblemCompanies() {
  const { data, error } = await supabase
    .from("company_analyses")
    .select("ticker, company_name, financials")
    .limit(30);

  if (error) throw error;

  return (data ?? []).filter((row: any) => {
    const f = row.financials || {};
    return (
      !f.revenue ||
      !f.operatingIncome ||
      !f.operatingCF ||
      !f.cash ||
      !f.assets ||
      !f.netAssets
    );
  });
}

async function main() {
  const companies = await getProblemCompanies();

  console.log(`対象会社数: ${companies.length}`);

  for (const company of companies) {
    console.log("\n==================================================");
    console.log(company.ticker, company.company_name);
    console.log("現在のfinancials:", company.financials);

    const latest = await findLatestDoc(company.ticker);

    if (!latest) {
      console.log("EDINET書類なし");
      continue;
    }

    console.log("date=", latest.date);
    console.log("docID=", latest.doc.docID);

    const rows = await fetchCsvRows(latest.doc.docID);

    console.log("\n--- revenue candidates ---");
    console.table(
      findCandidates(rows, ["netsales", "revenue", "売上", "収益"])
    );

    console.log("\n--- operatingIncome candidates ---");
    console.table(
      findCandidates(rows, ["operatingincome", "operatingprofit", "営業利益"])
    );

    console.log("\n--- operatingCF candidates ---");
    console.table(
      findCandidates(rows, ["operatingactivities", "営業活動"])
    );

    console.log("\n--- cash candidates ---");
    console.table(
      findCandidates(rows, ["cashand", "現金"])
    );

    console.log("\n--- assets candidates ---");
    console.table(
      findCandidates(rows, ["totalassets", "assets", "総資産", "資産合計"])
    );

    console.log("\n--- netAssets candidates ---");
    console.table(
      findCandidates(rows, ["netassets", "equity", "純資産", "資本"])
    );

    break;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});