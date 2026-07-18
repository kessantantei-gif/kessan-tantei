import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawn } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";

const EDINET_API_KEY = process.env.EDINET_API_KEY;
if (!EDINET_API_KEY) throw new Error("EDINET_API_KEY missing");

type Company = {
  ticker: string;
  company_name: string;
  edinet_code: string;
  market_segment: string;
};

type EdinetDocument = {
  docID: string;
  edinetCode: string;
  docTypeCode: string;
  submitDateTime?: string;
};

type AnalysisRow = {
  ticker: string;
  doc_id: string;
  created_at: string | null;
};

type Target = {
  company: Company;
  document: EdinetDocument;
  historyDocIDs: string[];
};

type Failure = {
  ticker: string;
  docID: string;
  exitCode: number | null;
};

function parseArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function toDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`日付形式が不正です: ${value}`);
  return date;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}時間${minutes}分${seconds}秒`;
}

function compareDocumentsNewestFirst(a: EdinetDocument, b: EdinetDocument) {
  const timeCompare = (b.submitDateTime ?? "").localeCompare(a.submitDateTime ?? "");
  if (timeCompare !== 0) return timeCompare;
  if (a.docTypeCode === b.docTypeCode) return 0;
  return a.docTypeCode === "130" ? -1 : 1;
}

async function fetchDocuments(date: string): Promise<EdinetDocument[]> {
  const url = new URL("https://disclosure.edinet-fsa.go.jp/api/v2/documents.json");
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", EDINET_API_KEY!);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": "kessan-tantei-edinet-backfill/4.0" },
    });

    if (response.ok) {
      const json = (await response.json()) as { results?: EdinetDocument[] };
      if (!Array.isArray(json.results)) {
        throw new Error(`${date}: documents.jsonにresultsがありません`);
      }
      return json.results;
    }

    if (attempt === 5) {
      throw new Error(`${date}: documents.json取得失敗 ${response.status} ${response.statusText}`);
    }

    await sleep(attempt * 2000);
  }

  return [];
}

async function loadCompanies() {
  const rows: Company[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, edinet_code, market_segment")
      .eq("listing_status", "listed")
      .not("edinet_code", "is", null)
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`全市場会社マスタ取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Company[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function loadLatestAnalysisByTicker() {
  const rows: AnalysisRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("company_analyses")
      .select("ticker, doc_id, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`既存分析取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as AnalysisRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  const latest = new Map<string, string>();
  for (const row of rows) {
    if (!latest.has(row.ticker)) latest.set(row.ticker, row.doc_id);
  }
  return latest;
}

function analyze(target: Target): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(command, ["tsx", "scripts/analyze-company.ts"], {
      stdio: "inherit",
      env: {
        ...process.env,
        COMPANY_NAME: target.company.company_name,
        TICKER: target.company.ticker,
        DOC_ID: target.document.docID,
        HISTORY_DOC_IDS: target.historyDocIDs.join(","),
      },
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}

function printMarketProgress(companies: Company[], latestAnalysisByTicker: Map<string, string>) {
  for (const market of ["prime", "standard", "growth"]) {
    const marketCompanies = companies.filter((company) => company.market_segment === market);
    const completed = marketCompanies.filter((company) => latestAnalysisByTicker.has(company.ticker)).length;
    console.log(
      `${market.padEnd(8)} 対象 ${String(marketCompanies.length).padStart(4)} / ` +
        `分析保存済み ${String(completed).padStart(4)} / 未保存 ${String(marketCompanies.length - completed).padStart(4)}`
    );
  }
}

async function runConcurrentTargets(args: {
  targets: Target[];
  concurrency: number;
  continueOnError: boolean;
}) {
  const { targets, concurrency, continueOnError } = args;
  const failures: Failure[] = [];
  const startedAt = Date.now();
  let nextIndex = 0;
  let completed = 0;
  let succeeded = 0;
  let aborted = false;

  const worker = async (workerNumber: number) => {
    await sleep((workerNumber - 1) * 1000);

    while (!aborted) {
      const index = nextIndex++;
      if (index >= targets.length) return;

      const target = targets[index];
      console.log(
        `\n[開始 ${index + 1}/${targets.length}・worker ${workerNumber}] ` +
          `${target.company.ticker} ${target.company.company_name} ` +
          `[${target.company.market_segment}] ${target.document.docID} ` +
          `履歴候補${target.historyDocIDs.length}件`
      );

      let exitCode: number | null = null;
      try {
        exitCode = await analyze(target);
      } catch (error) {
        console.error(`分析プロセス起動失敗 ${target.company.ticker}:`, error);
      }

      completed += 1;
      if (exitCode === 0) succeeded += 1;
      else {
        failures.push({
          ticker: target.company.ticker,
          docID: target.document.docID,
          exitCode,
        });
        if (!continueOnError) aborted = true;
      }

      const elapsed = Date.now() - startedAt;
      const averagePerCompany = elapsed / Math.max(1, completed);
      const remaining = targets.length - completed;
      const eta = (averagePerCompany * remaining) / concurrency;
      console.log(
        `[進捗 ${completed}/${targets.length}] 成功 ${succeeded} / 失敗 ${failures.length} / ` +
          `経過 ${formatDuration(elapsed)} / 概算残り ${formatDuration(eta)}`
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, (_, index) => worker(index + 1))
  );

  return { succeeded, failures, elapsed: Date.now() - startedAt };
}

async function main() {
  const end = toDate(parseArgument("end") ?? new Date().toISOString().slice(0, 10));
  const explicitStart = parseArgument("start");
  const days = Number(parseArgument("days") ?? "400");
  const maxCompaniesArgument = Number(parseArgument("max-companies") ?? "0");
  const concurrencyArgument = Number(parseArgument("concurrency") ?? "2");
  const maxCompanies = Number.isFinite(maxCompaniesArgument) && maxCompaniesArgument > 0
    ? Math.floor(maxCompaniesArgument)
    : null;
  const concurrency = Number.isFinite(concurrencyArgument)
    ? Math.min(3, Math.max(1, Math.floor(concurrencyArgument)))
    : 2;
  const continueOnError = process.argv.includes("--continue-on-error");

  const start = explicitStart
    ? toDate(explicitStart)
    : new Date(end.getTime() - Math.max(1, days - 1) * 24 * 60 * 60 * 1000);
  if (start > end) throw new Error("startはend以前にしてください");

  const [companies, latestAnalysisByTicker] = await Promise.all([
    loadCompanies(),
    loadLatestAnalysisByTicker(),
  ]);
  const companyByEdinet = new Map(companies.map((company) => [company.edinet_code, company]));
  const documentsByEdinet = new Map<string, EdinetDocument[]>();

  console.log("===== All Markets EDINET Backfill v4 =====");
  console.log("Start:", formatDate(start));
  console.log("End:", formatDate(end));
  console.log("Listed companies:", companies.length);
  console.log("Existing analyses:", latestAnalysisByTicker.size);
  console.log("Continue on error:", continueOnError);
  console.log("Concurrency:", concurrency);
  console.log("Max companies:", maxCompanies ?? "unlimited");
  console.log("\n市場別の現在保存状況:");
  printMarketProgress(companies, latestAnalysisByTicker);
  console.log("\n[1/2] EDINET書類一覧を一度だけ走査し、各社の履歴候補も収集します。");

  let scannedBusinessDays = 0;
  for (
    let cursor = new Date(end);
    cursor >= start;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  ) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;

    const date = formatDate(cursor);
    const documents = await fetchDocuments(date);
    scannedBusinessDays += 1;

    for (const document of documents) {
      if (document.docTypeCode !== "120" && document.docTypeCode !== "130") continue;
      if (!companyByEdinet.has(document.edinetCode)) continue;

      const list = documentsByEdinet.get(document.edinetCode) ?? [];
      if (!list.some((item) => item.docID === document.docID)) list.push(document);
      list.sort(compareDocumentsNewestFirst);
      documentsByEdinet.set(document.edinetCode, list.slice(0, 6));
    }

    if (scannedBusinessDays % 20 === 0) {
      console.log(
        `SCAN ${date}: ${scannedBusinessDays}営業日 / 履歴候補取得 ${documentsByEdinet.size}社`
      );
    }
    await sleep(150);
  }

  let targets: Target[] = companies
    .map((company) => {
      const documents = documentsByEdinet.get(company.edinet_code) ?? [];
      const document = documents[0];
      return document
        ? { company, document, historyDocIDs: documents.map((item) => item.docID) }
        : null;
    })
    .filter((target): target is Target => Boolean(target))
    .filter(({ company, document }) => latestAnalysisByTicker.get(company.ticker) !== document.docID);

  if (maxCompanies !== null) targets = targets.slice(0, maxCompanies);

  console.log("\n[2/2] 走査済み履歴候補を使って解析します。会社ごとの日次再検索は行いません。");
  console.log("Companies with history candidates:", documentsByEdinet.size);
  console.log("Already latest / skipped:", documentsByEdinet.size - targets.length);
  console.log("Analysis targets:", targets.length);
  console.log("Concurrency:", concurrency);

  const result = await runConcurrentTargets({ targets, concurrency, continueOnError });

  console.log("\n===== Backfill Summary =====");
  console.log("Scanned business days:", scannedBusinessDays);
  console.log("Companies with history candidates:", documentsByEdinet.size);
  console.log("Targets:", targets.length);
  console.log("Succeeded:", result.succeeded);
  console.log("Failures:", result.failures.length);
  console.log("Elapsed:", formatDuration(result.elapsed));
  for (const failure of result.failures.slice(0, 50)) {
    console.log(`- ${failure.ticker} ${failure.docID}: exit ${failure.exitCode ?? "unknown"}`);
  }

  if (result.failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("全市場EDINETバックフィルに失敗しました。");
  console.error(error);
  process.exit(1);
});
