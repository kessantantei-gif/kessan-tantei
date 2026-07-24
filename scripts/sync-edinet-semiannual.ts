import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { supabaseAdmin } from "../lib/supabase";

const EDINET_API_KEY = process.env.EDINET_API_KEY;
if (!EDINET_API_KEY) throw new Error("EDINET_API_KEY missing");

type EdinetDocument = {
  docID: string;
  edinetCode: string;
  docTypeCode: string;
  docDescription?: string;
  filerName?: string;
  submitDateTime?: string;
};

type Company = {
  id: string;
  ticker: string;
  company_name: string;
  edinet_code: string;
};

function datesToProcess() {
  const explicit = process.argv.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (explicit) return [explicit];
  const lookback = Math.min(7, Math.max(1, Number(process.env.EDINET_SEMIANNUAL_LOOKBACK_DAYS ?? "3")));
  return Array.from({ length: lookback }, (_, index) => {
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(date);
  });
}

async function fetchDocuments(date: string): Promise<EdinetDocument[]> {
  const url = new URL("https://disclosure.edinet-fsa.go.jp/api/v2/documents.json");
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", EDINET_API_KEY!);
  const response = await fetch(url, { headers: { "user-agent": "kessan-tantei-semiannual/1.0" } });
  if (!response.ok) throw new Error(`${date}: EDINET一覧取得失敗 ${response.status}`);
  const body = (await response.json()) as { results?: EdinetDocument[] };
  if (!Array.isArray(body.results)) throw new Error(`${date}: resultsがありません`);
  return body.results;
}

async function loadCompanies() {
  const rows: Company[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("id, ticker, company_name, edinet_code")
      .eq("listing_status", "listed")
      .not("edinet_code", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(`会社マスタ取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Company[]));
    if ((data ?? []).length < 1000) break;
  }
  return new Map(rows.map((row) => [row.edinet_code, row]));
}

function ensureDownloaded(docID: string) {
  const result = spawnSync("npx", ["tsx", "scripts/download-edinet.ts"], {
    stdio: "inherit",
    env: { ...process.env, DOC_ID: docID },
  });
  if (result.status !== 0) throw new Error(`EDINET ZIP取得失敗 ${docID}`);
}

function accountingStandard(financials: Record<string, unknown>) {
  const value = financials.accountingStandard ?? financials.accountingStandards;
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function save(document: EdinetDocument, company: Company) {
  ensureDownloaded(document.docID);
  const financials = parseEdinetFinancials(document.docID) as Record<string, unknown>;
  const periodEnd = typeof financials.periodEnd === "string" ? financials.periodEnd : null;
  const fiscalYear = typeof financials.fiscalYear === "number" ? financials.fiscalYear : null;
  if (!periodEnd || !fiscalYear) throw new Error(`半期の決算期を取得できません ${document.docID}`);

  const title = document.docDescription || `半期報告書 ${company.company_name}`;
  const isCorrection = document.docTypeCode === "170" || /訂正/.test(title);
  const disclosedAt = document.submitDateTime || new Date().toISOString();
  const sourceUrl = `https://disclosure2.edinet-fsa.go.jp/WEEK0010.aspx?filerCode=${company.edinet_code}`;

  const { data: disclosure, error: disclosureError } = await supabaseAdmin
    .from("company_disclosures")
    .upsert(
      {
        company_id: company.id,
        ticker: company.ticker,
        source: "edinet",
        source_document_id: document.docID,
        document_type: "semiannual_report",
        title,
        disclosed_at: disclosedAt,
        fiscal_year: fiscalYear,
        fiscal_period_end: periodEnd,
        quarter: 2,
        cumulative: true,
        accounting_scope: "consolidated",
        accounting_standard: accountingStandard(financials),
        source_url: sourceUrl,
        raw_payload: document,
        is_correction: isCorrection,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source,source_document_id" }
    )
    .select("id")
    .single();
  if (disclosureError) throw new Error(`半期開示保存失敗 ${company.ticker}: ${disclosureError.message}`);

  const { error } = await supabaseAdmin.from("company_quarterly_financials").upsert(
    {
      company_id: company.id,
      disclosure_id: disclosure.id,
      ticker: company.ticker,
      fiscal_year: fiscalYear,
      fiscal_period_end: periodEnd,
      quarter: 2,
      cumulative: true,
      accounting_scope: "consolidated",
      accounting_standard: accountingStandard(financials),
      revenue: numberOrNull(financials.revenue),
      operating_income: numberOrNull(financials.operatingIncome),
      ordinary_income: numberOrNull(financials.ordinaryIncome),
      profit_attributable_to_owners: numberOrNull(financials.netIncome),
      operating_cf: numberOrNull(financials.operatingCF),
      investing_cf: numberOrNull(financials.investingCF),
      financing_cf: numberOrNull(financials.financingCF),
      total_assets: numberOrNull(financials.assets),
      net_assets: numberOrNull(financials.netAssets),
      equity: numberOrNull(financials.equity),
      data_quality:
        numberOrNull(financials.revenue) !== null || numberOrNull(financials.operatingIncome) !== null
          ? "unreviewed"
          : "warning",
      extraction_version: "edinet-semiannual-v1",
      raw_financials: financials,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,fiscal_period_end,quarter,accounting_scope" }
  );
  if (error) throw new Error(`半期累計保存失敗 ${company.ticker}: ${error.message}`);
}

async function main() {
  const dates = datesToProcess();
  const { data: run, error: runError } = await supabaseAdmin
    .from("data_import_runs")
    .insert({
      import_type: "edinet_semiannual_daily",
      status: "running",
      source: "EDINET API v2",
      started_at: new Date().toISOString(),
      metadata: { dates, documentTypeCodes: ["160", "170"] },
    })
    .select("id")
    .single();
  if (runError) throw new Error(`実行履歴作成失敗: ${runError.message}`);

  try {
    const companies = await loadCompanies();
    const documents: EdinetDocument[] = [];
    for (const date of dates) {
      const daily = await fetchDocuments(date);
      documents.push(...daily.filter((document) => ["160", "170"].includes(document.docTypeCode)));
    }

    const unique = [...new Map(documents.map((document) => [document.docID, document])).values()];
    let successCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];

    for (const document of unique) {
      const company = companies.get(document.edinetCode);
      if (!company) {
        skippedCount += 1;
        continue;
      }
      try {
        await save(document, company);
        successCount += 1;
      } catch (error) {
        failures.push(`${company.ticker}:${document.docID} ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const status = failures.length === 0 ? "success" : successCount > 0 ? "partial" : "failed";
    await supabaseAdmin
      .from("data_import_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        total_count: unique.length,
        success_count: successCount,
        failure_count: failures.length,
        metadata: { dates, documents: unique.length, saved: successCount, skippedCount, failures },
        error_summary: failures.slice(0, 20).join(" | ") || null,
      })
      .eq("id", run.id);

    console.log("===== EDINET Semiannual Sync =====");
    console.log("Documents:", unique.length);
    console.log("Saved:", successCount);
    console.log("Skipped:", skippedCount);
    console.log("Failures:", failures.length);
    if (status === "failed") process.exitCode = 1;
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
  console.error("EDINET半期同期に失敗しました。", error);
  process.exit(1);
});
