import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { parseTdnetTextBlockFinancials } from "../lib/tdnet-text-block-financials";
import { supabaseAdmin } from "../lib/supabase";

const EXPECTED = {
  revenue: 53_408_000_000,
  operatingIncome: 2_890_000_000,
  ordinaryIncome: 3_107_000_000,
  profitAttributableToOwners: 1_894_000_000,
};

async function main() {
  const { data: disclosure, error: disclosureError } = await supabaseAdmin
    .from("company_disclosures")
    .select("id, title, source_document_id, xbrl_url, fiscal_period_end, quarter, accounting_scope")
    .eq("source", "tdnet")
    .eq("ticker", "2751")
    .eq("source_document_id", "140120260727500039")
    .single();
  if (disclosureError) throw disclosureError;
  if (!disclosure.xbrl_url) throw new Error("2751訂正資料にXBRL URLがありません");

  const response = await fetch(disclosure.xbrl_url);
  if (!response.ok) throw new Error(`XBRL download failed ${response.status}`);
  const parsed = parseTdnetTextBlockFinancials(Buffer.from(await response.arrayBuffer()));

  const { data: quarterly, error: quarterlyError } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select(
      "ticker, fiscal_period_end, quarter, accounting_scope, revenue, operating_income, ordinary_income, profit_attributable_to_owners, extraction_version, raw_financials"
    )
    .eq("ticker", "2751")
    .eq("fiscal_period_end", "2026-04-30")
    .eq("quarter", 4)
    .eq("accounting_scope", "consolidated")
    .single();
  if (quarterlyError) throw quarterlyError;

  const actual = {
    revenue: quarterly.revenue,
    operatingIncome: quarterly.operating_income,
    ordinaryIncome: quarterly.ordinary_income,
    profitAttributableToOwners: quarterly.profit_attributable_to_owners,
  };

  console.log(
    JSON.stringify(
      {
        disclosure,
        parsed,
        stored: quarterly,
        expected: EXPECTED,
      },
      null,
      2
    )
  );

  for (const key of Object.keys(EXPECTED) as Array<keyof typeof EXPECTED>) {
    if (parsed[key] !== EXPECTED[key]) {
      throw new Error(`2751 text-block parse mismatch ${key}: ${parsed[key]} != ${EXPECTED[key]}`);
    }
    if (actual[key] !== EXPECTED[key]) {
      throw new Error(`2751 stored value mismatch ${key}: ${actual[key]} != ${EXPECTED[key]}`);
    }
  }

  if (quarterly.extraction_version !== "tdnet-quarterly-v4-text-block") {
    throw new Error(`2751 extraction version mismatch: ${quarterly.extraction_version}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
