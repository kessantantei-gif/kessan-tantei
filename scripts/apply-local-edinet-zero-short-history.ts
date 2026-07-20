import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { supabaseAdmin } from "../lib/supabase";

type Json = Record<string, unknown>;

type AuditRow = {
  ticker: string;
  companyName: string;
  zeroFields: string[];
  historyCount: number;
  reasons: string[];
};

type AuditReport = { rows?: AuditRow[] };

type EdinetTargetRow = {
  ticker: string;
  companyName: string;
  documentIds: string[];
};

type EdinetReport = { targetRows?: EdinetTargetRow[] };

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

function latestLog(prefix: string) {
  const dir = path.join(process.cwd(), "logs");
  const file = fs.readdirSync(dir).filter((name) => name.startsWith(prefix) && name.endsWith(".json")).sort().at(-1);
  if (!file) throw new Error(`${prefix} のレポートがありません`);
  return path.join(dir, file);
}

function validZip(docId: string) {
  const file = path.join(process.cwd(), "downloads", `${docId}.zip`);
  if (!fs.existsSync(file)) return false;
  const buffer = fs.readFileSync(file);
  return buffer.length > 4 && buffer.subarray(0, 2).toString() === "PK";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function zeroFields(row: Json | null | undefined) {
  if (!row) return [] as string[];
  return FIELDS.filter((field) => field in row && finite(row[field]) && row[field] === 0);
}

function periodKey(row: Json | null | undefined) {
  if (!row) return "";
  return String(row.periodEnd ?? row.fiscalYear ?? row.year ?? "");
}

function uniqueLatestThree(rows: Json[]) {
  const byPeriod = new Map<string, Json>();
  for (const row of rows) {
    const key = periodKey(row);
    if (key && !byPeriod.has(key)) byPeriod.set(key, row);
  }
  return [...byPeriod.values()].sort((a, b) => periodKey(a).localeCompare(periodKey(b))).slice(-3);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const auditPath = latestLog("audit-current-zero-short-history-");
  const edinetPath = latestLog("refetch-zero-short-history-");

  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8")) as AuditReport;
  const edinet = JSON.parse(fs.readFileSync(edinetPath, "utf8")) as EdinetReport;
  const edinetByTicker = new Map((edinet.targetRows ?? []).map((row) => [row.ticker, row]));
  const targets = audit.rows ?? [];

  console.log("===== 保存済みEDINET ZIPのみで修復 =====");
  console.log({ apply, targets: targets.length, auditPath, edinetPath });

  let updated = 0;
  let alreadyResolved = 0;
  let skippedMissingZip = 0;
  let skippedParse = 0;
  let skippedStillInvalid = 0;
  const results: Json[] = [];

  for (const target of targets) {
    const source = edinetByTicker.get(target.ticker);
    if (!source) {
      results.push({ ticker: target.ticker, status: "missing_edinet_target" });
      skippedMissingZip += 1;
      continue;
    }

    const localDocIds = source.documentIds.filter(validZip);
    if (localDocIds.length === 0) {
      results.push({ ticker: target.ticker, status: "no_local_zip" });
      skippedMissingZip += 1;
      continue;
    }

    const { data: current, error: loadError } = await supabaseAdmin
      .from("company_analyses")
      .select("ticker, financials, history")
      .eq("ticker", target.ticker)
      .maybeSingle();
    if (loadError) throw new Error(`${target.ticker}: ${loadError.message}`);
    if (!current) {
      results.push({ ticker: target.ticker, status: "missing_analysis" });
      continue;
    }

    const currentHistory = Array.isArray(current.history) ? current.history as Json[] : [];
    const currentZeros = [...new Set([
      ...zeroFields(current.financials as Json | null),
      ...currentHistory.flatMap((row) => zeroFields(row)),
    ])];
    const currentHistoryCount = new Set(currentHistory.map(periodKey).filter(Boolean)).size;
    if (currentZeros.length === 0 && currentHistoryCount >= 3) {
      alreadyResolved += 1;
      results.push({ ticker: target.ticker, status: "already_resolved" });
      continue;
    }

    const parsed: Json[] = [];
    const parseFailures: Json[] = [];
    for (const docId of localDocIds) {
      try {
        const row = parseEdinetFinancials(docId) as unknown as Json;
        if (!periodKey(row)) throw new Error("決算期なし");
        parsed.push({ ...row, docID: docId });
      } catch (error) {
        parseFailures.push({ docId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (parsed.length === 0) {
      skippedParse += 1;
      results.push({ ticker: target.ticker, status: "parse_failed", parseFailures });
      continue;
    }

    const history = uniqueLatestThree(parsed);
    const latest = parsed[0];
    const remainingZeros = [...new Set([
      ...zeroFields(latest),
      ...history.flatMap((row) => zeroFields(row)),
    ])];
    const needsThree = target.reasons.includes("history_under_3");
    const canApply = remainingZeros.length === 0 && (!needsThree || history.length >= 3);

    if (!canApply) {
      skippedStillInvalid += 1;
      results.push({
        ticker: target.ticker,
        status: "still_invalid",
        localDocIds,
        parsedDocumentIds: parsed.map((row) => row.docID),
        remainingZeros,
        historyCount: history.length,
        parseFailures,
      });
      continue;
    }

    if (!apply) {
      results.push({ ticker: target.ticker, status: "preview_ready", remainingZeros, historyCount: history.length });
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("company_analyses")
      .update({ financials: latest, history })
      .eq("ticker", target.ticker);
    if (updateError) throw new Error(`${target.ticker}: ${updateError.message}`);

    updated += 1;
    console.log(`[UPDATED] ${target.ticker} history=${history.length}`);
    results.push({ ticker: target.ticker, status: "updated", historyCount: history.length });
  }

  const outputPath = path.join(
    process.cwd(),
    "logs",
    `apply-local-edinet-zero-short-history-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    apply,
    updated,
    alreadyResolved,
    skippedMissingZip,
    skippedParse,
    skippedStillInvalid,
    results,
  }, null, 2));

  console.log({ apply, updated, alreadyResolved, skippedMissingZip, skippedParse, skippedStillInvalid, outputPath });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
