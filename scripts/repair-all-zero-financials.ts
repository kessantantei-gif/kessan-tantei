import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

const FINANCIAL_KEYS = [
  "revenue",
  "operatingIncome",
  "operatingCF",
  "cash",
  "currentAssets",
  "currentLiabilities",
  "assets",
  "netAssets",
] as const;

type FinancialKey = (typeof FINANCIAL_KEYS)[number];

type Financials = Partial<Record<FinancialKey, number | null>> & Record<string, unknown>;

type HistoryRow = {
  docID?: string;
  documentId?: string;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingCF?: number | null;
  [key: string]: unknown;
};

type AnalysisRow = {
  ticker: string;
  company_name: string;
  doc_id: string;
  financials: Financials | null;
  history: HistoryRow[] | null;
};

type ResultRow = {
  ticker: string;
  companyName: string;
  beforeZeroFields: string[];
  afterZeroFields: string[];
  status: "repaired" | "unresolved" | "failed";
  error?: string;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const onlyTicker = argValue("ticker")?.trim().toUpperCase() || "";
const concurrency = Math.max(1, Number(argValue("concurrency") || "2"));
const dryRun = process.argv.includes("--dry-run");

function zeroFields(financials: Financials | null | undefined): string[] {
  if (!financials) return [...FINANCIAL_KEYS];
  return FINANCIAL_KEYS.filter((key) => financials[key] === 0 || financials[key] == null);
}

function historyDocIDs(history: HistoryRow[] | null | undefined, latestDocID: string) {
  return Array.from(
    new Set(
      [latestDocID, ...(history ?? []).map((row) => row.docID || row.documentId || "")]
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 8);
}

async function loadAnalyses() {
  return loadAllSupabaseRows<AnalysisRow>(
    "0値財務データ取得",
    (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, doc_id, financials, history")
        .range(from, to),
    1000
  );
}

async function reloadAnalysis(ticker: string): Promise<AnalysisRow> {
  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, doc_id, financials, history")
    .eq("ticker", ticker)
    .single();

  if (error || !data) {
    throw new Error(`再取得失敗: ${error?.message || "データなし"}`);
  }

  return data as AnalysisRow;
}

function runAnalyze(row: AnalysisRow) {
  const ids = historyDocIDs(row.history, row.doc_id);
  execFileSync("npx", ["tsx", "scripts/analyze-company.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      TICKER: row.ticker,
      COMPANY_NAME: row.company_name,
      DOC_ID: row.doc_id,
      HISTORY_DOC_IDS: ids.join(","),
    },
  });
}

async function processRow(row: AnalysisRow): Promise<ResultRow> {
  const beforeZeroFields = zeroFields(row.financials);
  const label = `${row.ticker} ${row.company_name}`;

  if (dryRun) {
    console.log(`[DRY] ${label}: ${beforeZeroFields.join(", ")}`);
    return {
      ticker: row.ticker,
      companyName: row.company_name,
      beforeZeroFields,
      afterZeroFields: beforeZeroFields,
      status: "unresolved",
    };
  }

  try {
    runAnalyze(row);
    const refreshed = await reloadAnalysis(row.ticker);
    const afterZeroFields = zeroFields(refreshed.financials);
    const status = afterZeroFields.length === 0 ? "repaired" : "unresolved";

    console.log(
      `[${status === "repaired" ? "OK" : "NG"}] ${label}: ` +
        `${beforeZeroFields.join(", ")} -> ${afterZeroFields.length ? afterZeroFields.join(", ") : "0値なし"}`
    );

    return {
      ticker: row.ticker,
      companyName: row.company_name,
      beforeZeroFields,
      afterZeroFields,
      status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FAIL] ${label}: ${message}`);
    return {
      ticker: row.ticker,
      companyName: row.company_name,
      beforeZeroFields,
      afterZeroFields: beforeZeroFields,
      status: "failed",
      error: message,
    };
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function main() {
  const analyses = await loadAnalyses();
  const targets = analyses.filter((row) => {
    if (!row.doc_id) return false;
    if (onlyTicker && row.ticker.toUpperCase() !== onlyTicker) return false;
    return zeroFields(row.financials).length > 0;
  });

  console.log("===== 全社0値財務データ修復 =====");
  console.log({
    analyses: analyses.length,
    targets: targets.length,
    onlyTicker: onlyTicker || null,
    concurrency,
    dryRun,
  });

  const startedAt = Date.now();
  const results = await mapConcurrent(targets, concurrency, async (row, index) => {
    const result = await processRow(row);
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const completed = index + 1;
    const remainingSeconds = Math.round((elapsedSeconds / completed) * (targets.length - completed));
    console.log(
      `進捗 ${completed}/${targets.length} / 経過 ${elapsedSeconds}秒 / 残り目安 ${remainingSeconds}秒`
    );
    return result;
  });

  const repaired = results.filter((row) => row.status === "repaired");
  const unresolved = results.filter((row) => row.status === "unresolved");
  const failed = results.filter((row) => row.status === "failed");

  const reportDirectory = path.join(process.cwd(), "logs");
  fs.mkdirSync(reportDirectory, { recursive: true });
  const reportPath = path.join(
    reportDirectory,
    `zero-financial-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        analyses: analyses.length,
        targets: targets.length,
        repaired: repaired.length,
        unresolved: unresolved.length,
        failed: failed.length,
        results,
      },
      null,
      2
    )
  );

  console.log("\n===== 修復結果 =====");
  console.log({
    targets: targets.length,
    repaired: repaired.length,
    unresolved: unresolved.length,
    failed: failed.length,
    reportPath,
  });

  if (!dryRun && (unresolved.length > 0 || failed.length > 0)) {
    console.error("0値が残っている会社があります。レポートを確認してください。");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("全社0値財務データ修復に失敗しました。");
  console.error(error);
  process.exit(1);
});
