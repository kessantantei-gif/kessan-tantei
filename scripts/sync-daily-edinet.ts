import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "child_process";
import { supabaseAdmin } from "../lib/supabase";

const EDINET_API_KEY = process.env.EDINET_API_KEY;
if (!EDINET_API_KEY) throw new Error("EDINET_API_KEY missing");

type EdinetDocument = {
  docID: string;
  edinetCode: string;
  docTypeCode: string;
  filerName?: string;
  submitDateTime?: string;
};

type Company = {
  id: string;
  ticker: string;
  company_name: string;
  edinet_code: string;
  market_segment: string;
  listing_status: string;
};

function targetDate() {
  const argument = process.argv.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  return argument ?? new Date().toISOString().slice(0, 10);
}

async function fetchDocuments(date: string): Promise<EdinetDocument[]> {
  const url = new URL("https://disclosure.edinet-fsa.go.jp/api/v2/documents.json");
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", EDINET_API_KEY!);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`documents.json取得失敗: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { results?: EdinetDocument[] };
  if (!Array.isArray(json.results)) throw new Error("documents.jsonにresultsがありません");
  return json.results;
}

async function loadCompanies(): Promise<Company[]> {
  const rows: Company[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("id, ticker, company_name, edinet_code, market_segment, listing_status")
      .eq("listing_status", "listed")
      .not("edinet_code", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`全市場会社マスタ取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Company[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function latestDocumentId(ticker: string) {
  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("doc_id")
    .eq("ticker", ticker)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`最新分析取得失敗 ${ticker}: ${error.message}`);
  return data?.doc_id ?? null;
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
  const date = targetDate();
  console.log("===== All Markets Daily EDINET Sync Start =====");
  console.log("Date:", date);

  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabaseAdmin
    .from("data_import_runs")
    .insert({
      import_type: "edinet_daily_all_markets",
      status: "running",
      source: "EDINET API v2",
      started_at: startedAt,
      metadata: { date },
    })
    .select("id")
    .single();
  if (runError) throw new Error(`インポート履歴作成失敗: ${runError.message}`);

  try {
    const [documents, companies] = await Promise.all([
      fetchDocuments(date),
      loadCompanies(),
    ]);

    const annualDocuments = documents.filter(
      (document) => document.docTypeCode === "120" || document.docTypeCode === "130"
    );
    const companiesByEdinet = new Map(
      companies.map((company) => [company.edinet_code, company])
    );
    const targets = annualDocuments
      .map((document) => ({ document, company: companiesByEdinet.get(document.edinetCode) }))
      .filter((target): target is { document: EdinetDocument; company: Company } => Boolean(target.company));

    console.log("Annual documents:", annualDocuments.length);
    console.log("All-market targets:", targets.length);

    let successCount = 0;
    let skippedCount = 0;
    const failures: Array<{ ticker: string; docID: string; reason: string }> = [];

    for (const { company, document } of targets) {
      const latest = await latestDocumentId(company.ticker);
      if (latest === document.docID) {
        console.log(`SKIP ${company.ticker} already latest`);
        skippedCount += 1;
        continue;
      }

      console.log(`NEW DOC: ${company.ticker} ${company.company_name} [${company.market_segment}]`);
      const result = analyze(company, document);
      if (result.status === 0) {
        successCount += 1;
      } else {
        failures.push({
          ticker: company.ticker,
          docID: document.docID,
          reason: `analyze-company exit ${result.status ?? "unknown"}`,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const status = failures.length === 0 ? "success" : successCount > 0 ? "partial" : "failed";
    const { error: finishError } = await supabaseAdmin
      .from("data_import_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        total_count: targets.length,
        success_count: successCount + skippedCount,
        failure_count: failures.length,
        metadata: {
          date,
          documents: documents.length,
          annualDocuments: annualDocuments.length,
          targets: targets.length,
          analyzed: successCount,
          skipped: skippedCount,
          failures: failures.slice(0, 100),
        },
        error_summary:
          failures.length > 0
            ? failures.slice(0, 20).map((failure) => `${failure.ticker}:${failure.docID}`).join(", ")
            : null,
      })
      .eq("id", run.id);
    if (finishError) throw new Error(`インポート履歴更新失敗: ${finishError.message}`);

    console.log("===== All Markets Daily EDINET Sync Done =====");
    console.log("Analyzed:", successCount);
    console.log("Skipped:", skippedCount);
    console.log("Failed:", failures.length);

    if (failures.length > 0) process.exitCode = 1;
  } catch (error) {
    await supabaseAdmin
      .from("data_import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        failure_count: 1,
        error_summary: error instanceof Error ? error.message : String(error),
      })
      .eq("id", run.id);
    throw error;
  }
}

main().catch((error) => {
  console.error("全市場EDINET日次同期に失敗しました。");
  console.error(error);
  process.exit(1);
});