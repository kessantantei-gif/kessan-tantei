import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
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

async function fetchDocuments(date: string): Promise<EdinetDocument[]> {
  const url = new URL("https://disclosure.edinet-fsa.go.jp/api/v2/documents.json");
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", EDINET_API_KEY!);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": "kessan-tantei-edinet-backfill/2.0" },
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

    await sleep(attempt * 1000);
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

function isNewerDocument(candidate: EdinetDocument, current: EdinetDocument) {
  const candidateTime = candidate.submitDateTime ?? "";
  const currentTime = current.submitDateTime ?? "";
  if (candidateTime !== currentTime) return candidateTime > currentTime;

  // 同時刻なら訂正有報を優先する。
  if (candidate.docTypeCode === "130" && current.docTypeCode !== "130") return true;
  return false;
}

function analyze(company: Company, document: EdinetDocument) {
  return spawnSync("npx", ["tsx", "scripts/analyze-company.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      COMPANY_NAME: company.company_name,
      TICKER: company.ticker,
      DOC_ID: document.docID,
    },
  });
}

async function main() {
  const end = toDate(parseArgument("end") ?? new Date().toISOString().slice(0, 10));
  const explicitStart = parseArgument("start");
  const days = Number(parseArgument("days") ?? "400");
  const maxCompaniesArgument = Number(parseArgument("max-companies") ?? "0");
  const maxCompanies = Number.isFinite(maxCompaniesArgument) && maxCompaniesArgument > 0
    ? Math.floor(maxCompaniesArgument)
    : null;
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
  const latestDocumentByEdinet = new Map<string, EdinetDocument>();

  console.log("===== All Markets EDINET Latest-Only Backfill =====");
  console.log("Start:", formatDate(start));
  console.log("End:", formatDate(end));
  console.log("Listed companies:", companies.length);
  console.log("Existing analyses:", latestAnalysisByTicker.size);
  console.log("Continue on error:", continueOnError);
  console.log("Max companies:", maxCompanies ?? "unlimited");
  console.log("\n[1/2] EDINET書類一覧を走査します。分析・ZIP取得はまだ行いません。");

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

      const current = latestDocumentByEdinet.get(document.edinetCode);
      if (!current || isNewerDocument(document, current)) {
        latestDocumentByEdinet.set(document.edinetCode, document);
      }
    }

    if (scannedBusinessDays % 20 === 0) {
      console.log(
        `SCAN ${date}: ${scannedBusinessDays}営業日 / 最新書類 ${latestDocumentByEdinet.size}社`
      );
    }

    await sleep(120);
  }

  let targets = companies
    .map((company) => ({
      company,
      document: latestDocumentByEdinet.get(company.edinet_code),
    }))
    .filter(
      (target): target is { company: Company; document: EdinetDocument } =>
        Boolean(target.document)
    )
    .filter(
      ({ company, document }) => latestAnalysisByTicker.get(company.ticker) !== document.docID
    );

  if (maxCompanies !== null) targets = targets.slice(0, maxCompanies);

  console.log("\n[2/2] 各社の最新書類だけを解析します。");
  console.log("Latest documents found:", latestDocumentByEdinet.size);
  console.log("Already latest / skipped:", latestDocumentByEdinet.size - targets.length);
  console.log("Analysis targets:", targets.length);

  let successCount = 0;
  const failures: Array<{ ticker: string; docID: string; exitCode: number | null }> = [];

  for (const [index, { company, document }] of targets.entries()) {
    console.log(
      `\n[${index + 1}/${targets.length}] ${company.ticker} ${company.company_name} ` +
        `[${company.market_segment}] ${document.docID}`
    );

    const result = analyze(company, document);
    if (result.status === 0) {
      successCount += 1;
    } else {
      failures.push({
        ticker: company.ticker,
        docID: document.docID,
        exitCode: result.status,
      });
      if (!continueOnError) break;
    }

    await sleep(500);
  }

  console.log("\n===== Backfill Summary =====");
  console.log("Scanned business days:", scannedBusinessDays);
  console.log("Latest documents found:", latestDocumentByEdinet.size);
  console.log("Targets:", targets.length);
  console.log("Succeeded:", successCount);
  console.log("Failures:", failures.length);
  for (const failure of failures.slice(0, 50)) {
    console.log(`- ${failure.ticker} ${failure.docID}: exit ${failure.exitCode ?? "unknown"}`);
  }

  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("全市場EDINETバックフィルに失敗しました。");
  console.error(error);
  process.exit(1);
});
