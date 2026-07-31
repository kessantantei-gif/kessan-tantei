import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

const ticker = "6702";

async function main() {
  const [masterResult, analysisResult, disclosureResult, quarterlyResult, importRunResult] =
    await Promise.all([
      supabaseAdmin
        .from("all_market_companies")
        .select("id, ticker, company_name, listing_status")
        .eq("ticker", ticker)
        .maybeSingle(),
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, doc_id, updated_at")
        .eq("ticker", ticker)
        .maybeSingle(),
      supabaseAdmin
        .from("company_disclosures")
        .select(
          "id, ticker, source, source_document_id, document_type, title, disclosed_at, fiscal_year, fiscal_period_end, quarter, xbrl_url, pdf_url, updated_at"
        )
        .eq("ticker", ticker)
        .order("disclosed_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("company_quarterly_financials")
        .select(
          "id, ticker, disclosure_id, fiscal_year, fiscal_period_end, quarter, cumulative, accounting_scope, accounting_standard, revenue, operating_income, ordinary_income, profit_attributable_to_owners, operating_cf, data_quality, extraction_version, updated_at"
        )
        .eq("ticker", ticker)
        .order("fiscal_period_end", { ascending: false })
        .order("quarter", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("data_import_runs")
        .select(
          "id, import_type, status, started_at, finished_at, total_count, success_count, failure_count, error_summary, metadata"
        )
        .eq("import_type", "tdnet_quarterly_daily")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

  const results = {
    master: masterResult,
    analysis: analysisResult,
    disclosures: disclosureResult,
    quarterly: quarterlyResult,
    importRuns: importRunResult,
  };

  console.log("===== FUJITSU 6702 QUARTERLY DIAGNOSIS =====");
  console.log(JSON.stringify(results, null, 2));

  const queryErrors = [
    masterResult.error,
    analysisResult.error,
    disclosureResult.error,
    quarterlyResult.error,
    importRunResult.error,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    throw new Error(
      `診断クエリ失敗: ${queryErrors.map((error) => error?.message).join(" | ")}`
    );
  }

  const latestDisclosure = disclosureResult.data?.[0];
  const latestQuarterly = quarterlyResult.data?.[0];

  if (!latestDisclosure || latestDisclosure.disclosed_at < "2026-07-30T00:00:00+09:00") {
    throw new Error("富士通の2026-07-30決算短信がcompany_disclosuresにありません");
  }

  if (!latestQuarterly || latestQuarterly.fiscal_period_end < "2026-06-30") {
    throw new Error("富士通の2027年3月期第1四半期数値がcompany_quarterly_financialsにありません");
  }

  if (latestQuarterly.revenue === null || latestQuarterly.operating_income === null) {
    throw new Error("富士通の第1四半期売上収益または営業利益を取得できていません");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
