import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { supabaseAdmin } from "../lib/supabase";
import { parseTdnetTextBlockFinancials } from "../lib/tdnet-text-block-financials";

const targets = ["4475", "3172"];

async function main() {
  const { data: disclosures, error } = await supabaseAdmin
    .from("company_disclosures")
    .select("id,company_id,ticker,title,document_type,source_document_id,disclosed_at,fiscal_year,fiscal_period_end,quarter,accounting_scope,accounting_standard,xbrl_url,pdf_url,raw_payload,is_correction")
    .in("ticker", targets)
    .eq("source","tdnet")
    .order("disclosed_at",{ascending:true});
  if (error) throw error;

  const { data: rows, error: rowError } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select("id,company_id,disclosure_id,ticker,fiscal_year,fiscal_period_end,quarter,accounting_scope,accounting_standard,revenue,operating_income,ordinary_income,profit_attributable_to_owners,operating_cf,investing_cf,financing_cf,extraction_version,data_quality,raw_financials")
    .in("ticker",targets)
    .order("fiscal_period_end",{ascending:true});
  if (rowError) throw rowError;

  console.log("=== TARGET DISCLOSURES ===");
  for (const d of disclosures ?? []) {
    const raw=(d.raw_payload ?? {}) as Record<string,unknown>;
    const candidate=(raw.candidate ?? {}) as Record<string,unknown>;
    console.log(JSON.stringify({
      id:d.id,ticker:d.ticker,title:d.title,document_type:d.document_type,
      source_document_id:d.source_document_id,disclosed_at:d.disclosed_at,
      fiscal_year:d.fiscal_year,fiscal_period_end:d.fiscal_period_end,quarter:d.quarter,
      accounting_scope:d.accounting_scope,accounting_standard:d.accounting_standard,
      xbrl_url:d.xbrl_url,pdf_url:d.pdf_url,is_correction:d.is_correction,
      extractionError:raw.extractionError ?? null,
      extractionVersion:raw.extractionVersion ?? null,
      candidate:{title:candidate.title,ticker:candidate.ticker,quarter:candidate.quarter,documentType:candidate.documentType,xbrlUrl:candidate.xbrlUrl}
    },null,2));
  }
  console.log("=== DIRECT XBRL TEXT-BLOCK PARSE ===");
  for (const d of disclosures ?? []) {
    if (!d.xbrl_url || !["4475","3172"].includes(d.ticker)) continue;
    const response = await fetch(d.xbrl_url, { headers: { "user-agent": "kessan-tantei-gap-diagnostic/1.0" } });
    const buffer = Buffer.from(await response.arrayBuffer());
    let parsed: unknown = null;
    let parseError: string | null = null;
    try { parsed = parseTdnetTextBlockFinancials(buffer); }
    catch (e) { parseError = e instanceof Error ? e.message : String(e); }
    console.log(JSON.stringify({ticker:d.ticker,status:response.status,bytes:buffer.length,parsed,parseError},null,2));
  }

  console.log("=== TARGET QUARTERLY ROWS ===");
  console.log(JSON.stringify(rows,null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
