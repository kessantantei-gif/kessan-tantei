import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabase";
import { extractRowsFromEdinetCsvZip } from "../lib/edinet-financial-parser";

type AuditReport = {
  issues?: Array<{ ticker?: string }>;
};

type HistoryRow = {
  docID?: string;
  periodEnd?: string;
  fiscalPeriod?: string;
  revenue?: number | null;
  operatingIncome?: number | null;
};

type AnalysisRow = {
  ticker: string;
  company_name: string | null;
  doc_id: string | null;
  financials: Record<string, unknown> | null;
  history: HistoryRow[] | null;
};

type CsvRow = Record<string, string>;

const EDINET_API_KEY = process.env.EDINET_API_KEY;
if (!EDINET_API_KEY) throw new Error("EDINET_API_KEY is missing");

function field(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return "";
}

function element(row: CsvRow) {
  return field(row, ["要素ID", "Element ID", "element_id", "Element", "element"]);
}

function itemName(row: CsvRow) {
  return field(row, ["項目名", "Item Name", "item_name", "name", "Name", "ラベル", "Label"]);
}

function context(row: CsvRow) {
  return field(row, ["コンテキストID", "Context ID", "context", "Context"]);
}

function unit(row: CsvRow) {
  return field(row, ["単位", "Unit", "unit"]);
}

function rawValue(row: CsvRow) {
  return field(row, ["値", "Value", "value", "金額", "Amount", "amount"]);
}

function numericAmount(row: CsvRow) {
  const raw = rawValue(row)
    .replaceAll(",", "")
    .replaceAll("△", "-")
    .replaceAll("▲", "-")
    .replaceAll("−", "-")
    .replaceAll("－", "-")
    .trim();
  if (!raw || raw === "-") return null;
  const normalized = /^\(.+\)$/.test(raw) ? `-${raw.slice(1, -1)}` : raw;
  let value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const rowUnit = unit(row);
  const all = Object.values(row).join(" ");
  if (rowUnit.includes("百万円") || all.includes("百万円")) value *= 1_000_000;
  else if (rowUnit.includes("千円") || all.includes("千円")) value *= 1_000;
  return value;
}

function isCurrentDuration(row: CsvRow) {
  const rowContext = context(row);
  const all = Object.values(row).join(" ");
  const current =
    rowContext.includes("CurrentYear") ||
    rowContext.includes("CurrentPeriod") ||
    all.includes("当期") ||
    all.includes("当連結");
  const duration = rowContext.includes("Duration") || all.includes("期間");
  const prior =
    rowContext.includes("Prior") ||
    rowContext.includes("Previous") ||
    all.includes("前期") ||
    all.includes("前連結");
  return current && duration && !prior;
}

function hasSegment(row: CsvRow) {
  const rowContext = context(row);
  return (
    rowContext.includes("ReportableSegment") ||
    rowContext.includes("SegmentsMember") ||
    rowContext.includes("ReconcilingItemsMember") ||
    rowContext.includes("BusinessReportableSegmentMember")
  );
}

function likelyFinancialMetric(row: CsvRow) {
  const text = `${element(row)} ${itemName(row)}`.normalize("NFKC").toLowerCase();
  return /(revenue|sales|income|profit|ordinary|operating|insurance|premium|interest|commission|finance|経常収益|営業収益|売上|収益|保険料|利息|手数料|利益)/i.test(
    text
  );
}

function candidateRows(rows: CsvRow[]) {
  const scored = rows
    .filter((row) => isCurrentDuration(row) && !hasSegment(row))
    .map((row) => ({ row, amount: numericAmount(row) }))
    .filter(
      (item): item is { row: CsvRow; amount: number } =>
        item.amount !== null && Math.abs(item.amount) >= 1_000_000
    )
    .sort((left, right) => {
      const likelyDifference =
        Number(likelyFinancialMetric(right.row)) -
        Number(likelyFinancialMetric(left.row));
      if (likelyDifference !== 0) return likelyDifference;
      return Math.abs(right.amount) - Math.abs(left.amount);
    });

  const seen = new Set<string>();
  const result = [];
  for (const item of scored) {
    const key = `${element(item.row)}|${context(item.row)}|${item.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      element: element(item.row),
      name: itemName(item.row),
      context: context(item.row),
      rawValue: rawValue(item.row),
      unit: unit(item.row),
      amount: item.amount,
      likelyMetric: likelyFinancialMetric(item.row),
    });
    if (result.length >= 120) break;
  }
  return result;
}

async function fetchCsvZip(docID: string) {
  const url = new URL(
    `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${docID}`
  );
  url.searchParams.set("type", "5");
  url.searchParams.set("Subscription-Key", EDINET_API_KEY!);
  const response = await fetch(url, {
    headers: { "user-agent": "kessan-tantei-financial-diagnostic/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${docID}: CSV取得失敗 ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const report = JSON.parse(
    readFileSync("reports/financial-sector-audit.json", "utf8")
  ) as AuditReport;
  const tickers = Array.from(
    new Set(
      (report.issues ?? [])
        .map((issue) => issue.ticker)
        .filter((ticker): ticker is string => Boolean(ticker))
    )
  );

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, doc_id, financials, history")
    .in("ticker", tickers)
    .order("ticker", { ascending: true });
  if (error) throw new Error(`診断対象の取得失敗: ${error.message}`);

  const analyses = (data ?? []) as AnalysisRow[];
  const diagnostics = [];

  for (const analysis of analyses) {
    const documentIDs = Array.from(
      new Set([
        ...(analysis.doc_id ? [analysis.doc_id] : []),
        ...(Array.isArray(analysis.history)
          ? analysis.history
              .map((row) => row.docID)
              .filter((docID): docID is string => Boolean(docID))
          : []),
      ])
    ).slice(0, 3);

    const documents = [];
    for (const docID of documentIDs) {
      try {
        const zip = await fetchCsvZip(docID);
        const rows = extractRowsFromEdinetCsvZip(zip) as CsvRow[];
        documents.push({
          docID,
          candidates: candidateRows(rows),
        });
      } catch (error) {
        documents.push({
          docID,
          error: error instanceof Error ? error.message : String(error),
          candidates: [],
        });
      }
    }

    diagnostics.push({
      ticker: analysis.ticker,
      companyName: analysis.company_name,
      docID: analysis.doc_id,
      storedFinancials: analysis.financials,
      history: analysis.history,
      documents,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    targetTickers: tickers,
    missingAnalyses: tickers.filter(
      (ticker) => !analyses.some((analysis) => analysis.ticker === ticker)
    ),
    diagnostics,
  };

  writeFileSync(
    "reports/financial-sector-tag-diagnostics.json",
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.log({
    targetTickers: tickers.length,
    diagnosedCompanies: diagnostics.length,
    missingAnalyses: output.missingAnalyses,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
