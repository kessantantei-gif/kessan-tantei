import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Json = Record<string, unknown>;

type AuditRow = {
  ticker: string;
  companyName: string;
  reasons: string[];
  zeroFields: string[];
  historyCount: number;
};

type AuditReport = { rows?: AuditRow[] };

type SourceRow = {
  ticker: string;
  companyName: string;
  documentIds: string[];
};

type SourceReport = { targetRows?: SourceRow[] };

type Analysis = {
  ticker: string;
  financials: Json | null;
  history: Json[] | null;
};

type SourcePeriodStatus = "eligible" | "not_eligible" | "parse_failed";

type SourcePeriodEntry = {
  status: SourcePeriodStatus;
  sourcePeriodCount: number;
  periodKeys: string[];
  checkedDocumentIds: string[];
  parseFailures: Json[];
  checkedAt: string;
};

type SourcePeriodState = {
  updatedAt: string;
  tickers: Record<string, SourcePeriodEntry>;
};

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
  if (!row) return [] as string[];
  return FIELDS.filter((field) => field in row && finite(row[field]) && row[field] === 0);
}

function periodKey(row: Json | null | undefined) {
  if (!row) return "";
  return String(row.periodEnd ?? row.fiscalYear ?? row.year ?? "");
}

function latestLog(prefix: string) {
  const logsDir = path.join(process.cwd(), "logs");
  const name = fs.readdirSync(logsDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .at(-1);
  if (!name) throw new Error(`${prefix} のレポートがありません`);
  return path.join(logsDir, name);
}

function validZip(docId: string) {
  const zip = path.join(process.cwd(), "downloads", `${docId}.zip`);
  if (!fs.existsSync(zip)) return false;
  const buffer = fs.readFileSync(zip);
  return buffer.length > 4 && buffer.subarray(0, 2).toString() === "PK";
}

function download(docId: string) {
  if (validZip(docId)) return false;
  execSync(`DOC_ID=${docId} npx tsx scripts/download-edinet.ts`, { stdio: "inherit" });
  return true;
}

function parseDocument(docId: string): Json {
  const parsed = parseEdinetFinancials(docId) as unknown as Json;
  const key = periodKey(parsed);
  if (!key) throw new Error(`決算期を取得できません: ${docId}`);
  return { ...parsed, docID: docId };
}

function uniqueLatestThree(rows: Json[]) {
  const byPeriod = new Map<string, Json>();
  for (const row of rows) {
    const key = periodKey(row);
    if (key) byPeriod.set(key, row);
  }
  return [...byPeriod.values()]
    .sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
    .slice(-3);
}

function mergeHistory(current: Json[], parsed: Json[]) {
  const byPeriod = new Map<string, Json>();
  for (const row of current) {
    const key = periodKey(row);
    if (key) byPeriod.set(key, row);
  }
  for (const row of parsed) {
    const key = periodKey(row);
    if (key) byPeriod.set(key, row);
  }
  return [...byPeriod.values()]
    .sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
    .slice(-3);
}

function currentState(analysis: Analysis) {
  const financials = analysis.financials ?? null;
  const history = Array.isArray(analysis.history) ? analysis.history : [];
  const zeroFields = [...new Set([
    ...explicitZeroFields(financials),
    ...history.flatMap((row) => explicitZeroFields(row)),
  ])];
  const historyCount = new Set(history.map(periodKey).filter(Boolean)).size;
  return { financials, history, zeroFields, historyCount };
}

function sourceStatePath() {
  return path.join(process.cwd(), "logs", "edinet-source-period-state.json");
}

function loadSourceState(): SourcePeriodState {
  const file = sourceStatePath();
  if (!fs.existsSync(file)) {
    return { updatedAt: new Date().toISOString(), tickers: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<SourcePeriodState>;
  return {
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    tickers: parsed.tickers && typeof parsed.tickers === "object" ? parsed.tickers : {},
  };
}

function saveSourceState(state: SourcePeriodState) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(sourceStatePath(), JSON.stringify(state, null, 2));
}

function importPreviousBatchResults(state: SourcePeriodState) {
  const logsDir = path.join(process.cwd(), "logs");
  const files = fs.readdirSync(logsDir)
    .filter((name) => /^apply-edinet-refetch-zero-short-history-.*\.json$/.test(name))
    .sort();

  for (const file of files) {
    const report = JSON.parse(fs.readFileSync(path.join(logsDir, file), "utf8")) as { results?: Json[] };
    for (const result of report.results ?? []) {
      const ticker = typeof result.ticker === "string" ? result.ticker : "";
      const requiredHistoryCount = Number(result.requiredHistoryCount ?? 0);
      const after = result.after as Json | undefined;
      const historyCount = Number(after?.historyCount ?? NaN);
      if (!ticker || requiredHistoryCount !== 3 || !Number.isFinite(historyCount)) continue;
      if (state.tickers[ticker]) continue;

      const parseFailures = Array.isArray(result.parseFailures) ? result.parseFailures as Json[] : [];
      const checkedDocumentIds = Array.isArray(result.usedDocumentIds)
        ? result.usedDocumentIds.filter((value): value is string => typeof value === "string")
        : [];
      const status: SourcePeriodStatus = historyCount >= 3
        ? "eligible"
        : parseFailures.length > 0
          ? "parse_failed"
          : "not_eligible";

      state.tickers[ticker] = {
        status,
        sourcePeriodCount: Math.max(0, Math.min(3, historyCount)),
        periodKeys: [],
        checkedDocumentIds,
        parseFailures,
        checkedAt: new Date().toISOString(),
      };
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const batchSizeArg = Number(arg("batch-size") ?? "20");
  const batchSize = Number.isFinite(batchSizeArg) && batchSizeArg > 0 ? Math.floor(batchSizeArg) : 20;
  const tickerFilter = arg("ticker");

  const auditPath = latestLog("audit-current-zero-short-history-");
  const sourcePath = latestLog("refetch-zero-short-history-");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as AuditReport;
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as SourceReport;
  const sourceByTicker = new Map((source.targetRows ?? []).map((row) => [row.ticker, row]));

  const sourceState = loadSourceState();
  importPreviousBatchResults(sourceState);
  saveSourceState(sourceState);

  const analyses = await loadAllSupabaseRows<Analysis>("分析取得失敗", (from, to) =>
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, financials, history")
      .order("ticker", { ascending: true })
      .range(from, to)
  );
  const analysisByTicker = new Map(analyses.map((row) => [row.ticker, row]));

  let pending = (audit.rows ?? []).filter((target) => {
    if (tickerFilter && target.ticker !== tickerFilter) return false;
    const analysis = analysisByTicker.get(target.ticker);
    if (!analysis) return true;

    const current = currentState(analysis);
    const sourcePeriod = sourceState.tickers[target.ticker];
    const blockedByParseFailure = sourcePeriod?.status === "parse_failed";
    const needsZero = current.zeroFields.length > 0 && !blockedByParseFailure;
    const needsHistoryDiscovery = current.historyCount < 3 && !sourcePeriod;
    const needsHistoryRepair = current.historyCount < 3 && sourcePeriod?.status === "eligible";
    return needsZero || needsHistoryDiscovery || needsHistoryRepair;
  });

  const remainingBeforeBatch = pending.length;
  pending = pending.slice(0, batchSize);

  console.log("===== EDINET原本 修復バッチ =====");
  console.log({
    apply,
    auditPath,
    sourcePath,
    sourceStatePath: sourceStatePath(),
    remainingBeforeBatch,
    batchTargets: pending.length,
    batchSize,
    tickerFilter: tickerFilter ?? null,
  });

  const results: Json[] = [];
  let updated = 0;
  let downloaded = 0;
  let failed = 0;
  let notEligible = 0;

  for (let index = 0; index < pending.length; index += 1) {
    const target = pending[index];
    const analysis = analysisByTicker.get(target.ticker);
    const sourceRow = sourceByTicker.get(target.ticker);

    console.log(`[${index + 1}/${pending.length}] ${target.ticker} ${target.companyName}`);

    if (!analysis) {
      failed += 1;
      results.push({ ticker: target.ticker, status: "missing_analysis" });
      continue;
    }
    if (!sourceRow || sourceRow.documentIds.length === 0) {
      failed += 1;
      sourceState.tickers[target.ticker] = {
        status: "parse_failed",
        sourcePeriodCount: 0,
        periodKeys: [],
        checkedDocumentIds: [],
        parseFailures: [{ error: "missing_source_documents" }],
        checkedAt: new Date().toISOString(),
      };
      saveSourceState(sourceState);
      results.push({ ticker: target.ticker, status: "missing_source_documents" });
      continue;
    }

    const before = currentState(analysis);
    const parsedRows: Json[] = [];
    const parseFailures: Json[] = [];
    const usedDocumentIds: string[] = [];

    for (const docId of sourceRow.documentIds) {
      try {
        if (download(docId)) downloaded += 1;
        const parsed = parseDocument(docId);
        parsedRows.push(parsed);
        usedDocumentIds.push(docId);
        if (uniqueLatestThree(parsedRows).length >= 3) break;
      } catch (error) {
        parseFailures.push({
          docId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const sourceHistory = uniqueLatestThree(parsedRows);
    const sourcePeriodCount = sourceHistory.length;
    const sourceStatus: SourcePeriodStatus = sourcePeriodCount >= 3
      ? "eligible"
      : parseFailures.length > 0
        ? "parse_failed"
        : "not_eligible";

    sourceState.tickers[target.ticker] = {
      status: sourceStatus,
      sourcePeriodCount,
      periodKeys: sourceHistory.map(periodKey),
      checkedDocumentIds: usedDocumentIds,
      parseFailures,
      checkedAt: new Date().toISOString(),
    };
    saveSourceState(sourceState);

    const latest = parsedRows[0] ?? null;
    const mergedHistory = mergeHistory(before.history, parsedRows);
    const remainingZeroFields = [...new Set([
      ...explicitZeroFields(latest),
      ...mergedHistory.flatMap((row) => explicitZeroFields(row)),
    ])];
    const hasZeroProblem = before.zeroFields.length > 0;
    const historyRepairAllowed = sourceStatus === "eligible";
    const canApply = Boolean(latest)
      && remainingZeroFields.length === 0
      && (hasZeroProblem || historyRepairAllowed);

    const resultBase = {
      ticker: target.ticker,
      companyName: target.companyName,
      before: { zeroFields: before.zeroFields, historyCount: before.historyCount },
      after: { zeroFields: remainingZeroFields, historyCount: mergedHistory.length },
      sourcePeriodStatus: sourceStatus,
      sourcePeriodCount,
      sourcePeriodKeys: sourceHistory.map(periodKey),
      usedDocumentIds,
      parseFailures,
    };

    if (!canApply) {
      if (sourceStatus === "not_eligible" && !hasZeroProblem) {
        notEligible += 1;
        results.push({ ...resultBase, status: "not_eligible_for_three_periods" });
        console.log(`[NOT_ELIGIBLE] ${target.ticker} sourcePeriods=${sourcePeriodCount}`);
      } else {
        failed += 1;
        results.push({ ...resultBase, status: "still_invalid" });
        console.log(`[SKIP] ${target.ticker} sourcePeriods=${sourcePeriodCount} remainingZero=${remainingZeroFields.length}`);
      }
      continue;
    }

    if (!apply) {
      results.push({ ...resultBase, status: "preview_ready" });
      console.log(`[READY] ${target.ticker} history=${mergedHistory.length}`);
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("company_analyses")
      .update({ financials: latest, history: mergedHistory })
      .eq("ticker", target.ticker);

    if (updateError) {
      failed += 1;
      results.push({ ...resultBase, status: "failed_update", error: updateError.message });
      continue;
    }

    updated += 1;
    results.push({ ...resultBase, status: "updated" });
    console.log(`[UPDATED] ${target.ticker} history=${mergedHistory.length}`);
  }

  const outputPath = path.join(
    process.cwd(),
    "logs",
    `apply-edinet-refetch-zero-short-history-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    apply,
    auditPath,
    sourcePath,
    sourceStatePath: sourceStatePath(),
    remainingBeforeBatch,
    batchTargets: pending.length,
    updated,
    downloaded,
    failed,
    notEligible,
    results,
  }, null, 2));

  console.log({
    apply,
    remainingBeforeBatch,
    processed: pending.length,
    updated,
    downloaded,
    failed,
    notEligible,
    outputPath,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
