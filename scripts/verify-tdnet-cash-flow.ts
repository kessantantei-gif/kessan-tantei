import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

type ExpectedRow = {
  sourceDocumentId: string;
  ticker: string;
  quarter: number;
  operatingCF: number;
  investingCF: number;
  financingCF: number;
};

const expectedCorrections: ExpectedRow[] = [
  {
    sourceDocumentId: "140120260731505701",
    ticker: "4088",
    quarter: 1,
    operatingCF: 27_430_000_000,
    investingCF: -39_208_000_000,
    financingCF: -11_462_000_000,
  },
  {
    sourceDocumentId: "140120260731505745",
    ticker: "4088",
    quarter: 3,
    operatingCF: 60_461_000_000,
    investingCF: -56_271_000_000,
    financingCF: -21_486_000_000,
  },
  {
    sourceDocumentId: "140120260731505749",
    ticker: "4088",
    quarter: 1,
    operatingCF: 20_840_000_000,
    investingCF: -18_149_000_000,
    financingCF: -6_998_000_000,
  },
];

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: ${String(actual)} != ${String(expected)}`);
  }
}

async function verifyTempos() {
  const { data: disclosure, error: disclosureError } = await supabaseAdmin
    .from("company_disclosures")
    .select("id, company_id, ticker, fiscal_period_end, quarter, accounting_scope")
    .eq("source", "tdnet")
    .eq("source_document_id", "140120260727500039")
    .single();
  if (disclosureError) throw disclosureError;

  const { data: row, error: rowError } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select(
      "revenue, operating_income, ordinary_income, profit_attributable_to_owners, operating_cf, investing_cf, financing_cf, extraction_version"
    )
    .eq("company_id", disclosure.company_id)
    .eq("fiscal_period_end", disclosure.fiscal_period_end)
    .eq("quarter", disclosure.quarter)
    .eq("accounting_scope", disclosure.accounting_scope ?? "unknown")
    .single();
  if (rowError) throw rowError;

  const expected = {
    revenue: 53_408_000_000,
    operating_income: 2_890_000_000,
    ordinary_income: 3_107_000_000,
    profit_attributable_to_owners: 1_894_000_000,
    operating_cf: 1_707_000_000,
    investing_cf: -2_212_000_000,
    financing_cf: -273_000_000,
  };

  for (const [name, value] of Object.entries(expected)) {
    assertEqual(`2751 ${name}`, row[name as keyof typeof row], value);
  }
  assertEqual("2751 extraction_version", row.extraction_version, "tdnet-quarterly-v5-text-block-cf");

  return { disclosure, row };
}

async function verifyCorrections() {
  const results: Array<Record<string, unknown>> = [];

  for (const expected of expectedCorrections) {
    const { data: disclosure, error: disclosureError } = await supabaseAdmin
      .from("company_disclosures")
      .select("id, company_id, ticker, title, fiscal_period_end, quarter, accounting_scope")
      .eq("source", "tdnet")
      .eq("source_document_id", expected.sourceDocumentId)
      .single();
    if (disclosureError) throw disclosureError;

    assertEqual(`${expected.sourceDocumentId} ticker`, disclosure.ticker, expected.ticker);
    assertEqual(`${expected.sourceDocumentId} quarter`, disclosure.quarter, expected.quarter);

    const { data: row, error: rowError } = await supabaseAdmin
      .from("company_quarterly_financials")
      .select("quarter, operating_cf, investing_cf, financing_cf, extraction_version")
      .eq("company_id", disclosure.company_id)
      .eq("fiscal_period_end", disclosure.fiscal_period_end)
      .eq("quarter", expected.quarter)
      .eq("accounting_scope", disclosure.accounting_scope ?? "unknown")
      .single();
    if (rowError) throw rowError;

    assertEqual(`${expected.sourceDocumentId} row quarter`, row.quarter, expected.quarter);
    assertEqual(`${expected.sourceDocumentId} operating_cf`, row.operating_cf, expected.operatingCF);
    assertEqual(`${expected.sourceDocumentId} investing_cf`, row.investing_cf, expected.investingCF);
    assertEqual(`${expected.sourceDocumentId} financing_cf`, row.financing_cf, expected.financingCF);
    assertEqual(
      `${expected.sourceDocumentId} extraction_version`,
      row.extraction_version,
      "tdnet-quarterly-v5-text-block-cf"
    );

    results.push({ disclosure, row });
  }

  return results;
}

async function main() {
  const tempos = await verifyTempos();
  const corrections = await verifyCorrections();
  console.log(
    JSON.stringify(
      {
        status: "success",
        tempos,
        corrections,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
