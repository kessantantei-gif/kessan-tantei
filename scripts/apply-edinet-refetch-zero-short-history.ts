import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { supabaseAdmin } from "../lib/supabase";

type Json = Record<string, unknown>;
type TargetRow = {
  ticker: string;
  companyName: string;
  reasons: string[];
  zeroFields: string[];
  historyCount: number;
  documentIds: string[];
};
type Report = { targetRows?: TargetRow[] };

const FIELDS = [
  "revenue",
  "operatingIncome",
  "ordinaryIncome",
  "ordinaryProfit",
  "netIncome",
  "operatingCF",
  "investingCF",
  "financingCF",
  "cash",
  "currentAssets",
  "currentLiabilities",
  "assets",
  "liabilities",
  "netAssets",
  "loans",
  "deposits",
  "securities",
  "insuranceRevenue",
  "policyReserves",
] as const;

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function explicitZeroFields(row: Json | null | undefined) {
  if (!row) return [];
  return FIELDS.filter((field) => field in row && finite(row[field]) && row[field] === 0);
}

function periodKey(row: Json | null | undefined) {
  if (!row) return "";
  return String(row.periodEnd ?? row.fiscalYear ?? row.year ?? "");
}

function latestReportPath() {
  const logsDir = path.join(process.cwd(), "logs");
  const files = fs
    .readdirSync(logsDir)
    .filter((name) => /^refetch-zero-short-history-.*\.json$/.test(name))
    .sort();
  const name = files.at(-1);
  if (!name) throw new Error("refetch-zero-short-history の監査レポートがありません");
  return path.join(logsDir, name);
}

function validZip(docId: string) {
  const zip = path.join(process.cwd(), "downloads", `${docId}.zip`);
  if (!fs.existsSync(zip)) return false;
  const buffer = fs.readFileSync(zip);
  return buffer.length > 4 && buffer.subarray(0, 2).toString() === "PK";
}

function download(docId: string) {
  if (validZip(docId)) return;
  execSync(`DOC_ID=${docId} npx tsx scripts/download-edinet.ts`, { stdio: "inherit" });
}

function parseDocument(docId: string): Json {
  download(docId);
  const parsed = parseEdinetFinancials(docId) as unknown as Json;
  const key = periodKey(parsed);
  if (!key) throw new Error(`決算期を取得できません: ${docId}`);
  return { ...parsed, docID: docId };
}

function uniqueLatestThree(rows: Json[]) {
  const byPeriod = new Map<string, Json>();
  for (const row of rows) {
    const key = periodKey(row);
    if (key && !byPeriod.has(key)) byPeriod.set(key, row);
  }
  return [...byPeriod.values()]
    .sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
    .slice(-3);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const maxTargets = Math.max(1, Number(arg("max-targets") ?? "1"));
  const tickerFilter = arg("ticker");
  const reportPath = latestReportPath();
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Report;
  let targets = Array.isArray(report.targetRows) ? report.targetRows : [];
  if (tickerFilter) targets = targets.filter((row) => row.ticker === tickerFilter);
  targets = targets.slice(0, maxTargets);

  console.log("===== EDINET原本 0・3期未満 直接再取得 =====");
  console.log({ apply, reportPath, targets: targets.length, maxTargets, tickerFilter: tickerFilter ?? null });

  const results: Json[] = [];

  for (const target of targets) {
    const { data: current, error: loadError } = await supabaseAdmin
      .from("company_analyses")
      .select("ticker, financials, history")
      .eq("ticker", target.ticker)
      .maybeSingle();
    if (loadError) throw new Error(`${target.ticker}: 現在値取得失敗 ${loadError.message}`);
    if (!current) {
      results.push({ ticker: target.ticker, status: "missing_analysis" });
      continue;
    }

    const currentFinancials = (current.financials ?? null) as Json | null;
    const currentHistory = Array.isArray(current.history) ? (current.history as Json[]) : [];
    const currentZeroFields = [
      ...new Set([
        ...explicitZeroFields(currentFinancials),
        ...currentHistory.flatMap((row) => explicitZeroFields(row)),
      ]),
    ];
    const currentHistoryCount = new Set(currentHistory.map(periodKey).filter(Boolean)).size;

    if (currentZeroFields.length === 0 && currentHistoryCount >= 3) {
      results.push({ ticker: target.ticker, status: "already_resolved" });
      continue;
    }

    const parsedRows: Json[] = [];
    const parseFailures: Json[] = [];
    for (const docId of target.documentIds) {
      try {
        parsedRows.push(parseDocument(docId));
      } catch (error) {
        parseFailures.push({ docId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const history = uniqueLatestThree(parsedRows);
    const latest = parsedRows[0] ?? null;
    const remainingZeroFields = [
      ...new Set([
        ...explicitZeroFields(latest),
        ...history.flatMap((row) => explicitZeroFields(row)),
      ]),
    ];

    const canFixHistory = !target.reasons.includes("history_under_3") || history.length >= 3;
    const preview = {
      ticker: target.ticker,
      companyName: target.companyName,
      status: apply ? "pending_apply" : "preview",
      reasons: target.reasons,
      before: { zeroFields: currentZeroFields, historyCount: currentHistoryCount },
      after: { zeroFields: remainingZeroFields, historyCount: history.length },
      documentIds: target.documentIds,
      parsedDocumentIds: parsedRows.map((row) => row.docID),
      parseFailures,
      canFixHistory,
    };

    if (!apply) {
      results.push(preview);
      console.log("[PREVIEW]", preview);
      continue;
    }

    if (!latest) {
      results.push({ ...preview, status: "failed_no_latest" });
      continue;
    }
    if (!canFixHistory) {
      results.push({ ...preview, status: "failed_history_under_3" });
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("company_analyses")
      .update({ financials: latest, history })
      .eq("ticker", target.ticker);

    if (updateError) {
      results.push({ ...preview, status: "failed_update", error: updateError.message });
      continue;
    }

    results.push({ ...preview, status: "updated" });
    console.log(`[UPDATED] ${target.ticker} history=${history.length} remainingZero=${remainingZeroFields.length}`);
  }

  const outputPath = path.join(
    process.cwd(),
    "logs",
    `apply-edinet-refetch-zero-short-history-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), apply, reportPath, results }, null, 2));
  console.log({ apply, processed: results.length, outputPath });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
