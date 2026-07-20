import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Json = Record<string, unknown>;

type Company = {
  ticker: string;
  company_name: string;
  edinet_code: string | null;
};

type Analysis = {
  ticker: string;
  financials: Json | null;
  history: Json[] | null;
};

type EdinetDocument = {
  docID: string;
  edinetCode: string;
  docTypeCode: string;
  submitDateTime?: string;
};

type Target = {
  company: Company;
  reasons: string[];
  zeroFields: string[];
  historyCount: number;
  documentIds: string[];
};

const API_KEY = process.env.EDINET_API_KEY;
if (!API_KEY) throw new Error("EDINET_API_KEY missing");

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

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function periodKey(row: Json) {
  return String(row.periodEnd ?? row.fiscalYear ?? row.year ?? "");
}

function zeroFields(analysis: Analysis) {
  const found = new Set<string>();
  const rows = [analysis.financials, ...(Array.isArray(analysis.history) ? analysis.history : [])];

  for (const row of rows) {
    if (!row) continue;
    for (const field of FIELDS) {
      if (field in row && finite(row[field]) && row[field] === 0) found.add(field);
    }
  }

  return [...found].sort();
}

function historyCount(history: Json[] | null) {
  if (!Array.isArray(history)) return 0;
  return new Set(history.map(periodKey).filter(Boolean)).size;
}

function toDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error(`日付形式が不正です: ${value}`);
  return date;
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newestFirst(a: EdinetDocument, b: EdinetDocument) {
  const dateCompare = (b.submitDateTime ?? "").localeCompare(a.submitDateTime ?? "");
  if (dateCompare !== 0) return dateCompare;
  if (a.docTypeCode === b.docTypeCode) return 0;
  return a.docTypeCode === "130" ? -1 : 1;
}

async function fetchDocuments(date: string): Promise<EdinetDocument[]> {
  const url = new URL("https://disclosure.edinet-fsa.go.jp/api/v2/documents.json");
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", API_KEY!);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": "kessan-tantei-targeted-refetch/1.0" },
    });

    if (response.ok) {
      const json = (await response.json()) as { results?: EdinetDocument[] };
      if (!Array.isArray(json.results)) throw new Error(`${date}: resultsがありません`);
      return json.results;
    }

    if (attempt === 5) {
      throw new Error(`${date}: EDINET書類一覧取得失敗 ${response.status} ${response.statusText}`);
    }
    await sleep(attempt * 2000);
  }

  return [];
}

function runAnalysis(target: Target): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(command, ["tsx", "scripts/analyze-company.ts"], {
      stdio: "inherit",
      env: {
        ...process.env,
        TICKER: target.company.ticker,
        COMPANY_NAME: target.company.company_name,
        DOC_ID: target.documentIds[0],
        HISTORY_DOC_IDS: target.documentIds.join(","),
      },
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const days = Math.max(1100, Number(argument("days") ?? "1500"));
  const end = toDate(argument("end") ?? new Date().toISOString().slice(0, 10));
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const maxTargetsArg = Number(argument("max-targets") ?? "0");
  const maxTargets = Number.isFinite(maxTargetsArg) && maxTargetsArg > 0 ? Math.floor(maxTargetsArg) : null;

  const [companies, analyses] = await Promise.all([
    loadAllSupabaseRows<Company>("会社取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("ticker, company_name, edinet_code")
        .eq("listing_status", "listed")
        .not("edinet_code", "is", null)
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Analysis>("分析取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, financials, history")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
  ]);

  const companyMap = new Map(companies.map((row) => [row.ticker, row]));
  const candidates = analyses.flatMap((analysis) => {
    const company = companyMap.get(analysis.ticker);
    if (!company?.edinet_code) return [];

    const zeros = zeroFields(analysis);
    const count = historyCount(analysis.history);
    const reasons: string[] = [];
    if (zeros.length > 0) reasons.push("zero");
    if (count < 3) reasons.push("history_under_3");
    if (reasons.length === 0) return [];

    return [{ company, reasons, zeroFields: zeros, historyCount: count }];
  });

  const targetCodes = new Set(candidates.map((row) => row.company.edinet_code as string));
  const documentsByCode = new Map<string, EdinetDocument[]>();

  console.log("===== 0・3期未満 原本再取得 =====");
  console.log({ apply, candidates: candidates.length, start: dateText(start), end: dateText(end) });

  let scannedBusinessDays = 0;
  for (let cursor = new Date(end); cursor >= start; cursor = new Date(cursor.getTime() - 86400000)) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    const date = dateText(cursor);
    const documents = await fetchDocuments(date);
    scannedBusinessDays += 1;

    for (const document of documents) {
      if (document.docTypeCode !== "120" && document.docTypeCode !== "130") continue;
      if (!targetCodes.has(document.edinetCode)) continue;

      const list = documentsByCode.get(document.edinetCode) ?? [];
      if (!list.some((row) => row.docID === document.docID)) list.push(document);
      list.sort(newestFirst);
      documentsByCode.set(document.edinetCode, list.slice(0, 8));
    }

    if (scannedBusinessDays % 50 === 0) {
      console.log(`SCAN ${date}: ${scannedBusinessDays}営業日 / 書類取得 ${documentsByCode.size}社`);
    }
    await sleep(150);
  }

  let targets: Target[] = candidates.flatMap((candidate) => {
    const docs = documentsByCode.get(candidate.company.edinet_code as string) ?? [];
    if (docs.length === 0) return [];
    if (candidate.reasons.includes("history_under_3") && docs.length < 3 && candidate.zeroFields.length === 0) {
      return [];
    }

    return [{
      ...candidate,
      documentIds: docs.map((row) => row.docID),
    }];
  });

  if (maxTargets !== null) targets = targets.slice(0, maxTargets);

  const unresolved = candidates.filter((candidate) =>
    !targets.some((target) => target.company.ticker === candidate.company.ticker)
  );

  const reportPath = path.join(
    process.cwd(),
    "logs",
    `refetch-zero-short-history-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const report: Json = {
    generatedAt: new Date().toISOString(),
    apply,
    scannedBusinessDays,
    candidates: candidates.length,
    targets: targets.length,
    unresolved: unresolved.length,
    targetRows: targets.map((row) => ({
      ticker: row.company.ticker,
      companyName: row.company.company_name,
      reasons: row.reasons,
      zeroFields: row.zeroFields,
      historyCount: row.historyCount,
      documentIds: row.documentIds,
    })),
    unresolvedRows: unresolved.map((row) => ({
      ticker: row.company.ticker,
      companyName: row.company.company_name,
      reasons: row.reasons,
      zeroFields: row.zeroFields,
      historyCount: row.historyCount,
    })),
  };

  if (!apply) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log({ readOnly: true, scannedBusinessDays, candidates: candidates.length, targets: targets.length, unresolved: unresolved.length, reportPath });
    return;
  }

  let succeeded = 0;
  const failures: Json[] = [];
  for (const [index, target] of targets.entries()) {
    console.log(`\n[${index + 1}/${targets.length}] ${target.company.ticker} ${target.company.company_name}`);
    const code = await runAnalysis(target);
    if (code === 0) succeeded += 1;
    else failures.push({ ticker: target.company.ticker, exitCode: code });
  }

  report.succeeded = succeeded;
  report.failures = failures;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log({ apply: true, targets: targets.length, succeeded, failed: failures.length, reportPath });
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
