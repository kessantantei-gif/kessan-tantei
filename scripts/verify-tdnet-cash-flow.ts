import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

type ExpectedCorrection = {
  fiscalPeriodEnd: string;
  quarter: number;
  operatingCF: number;
  investingCF: number;
  financingCF: number;
};

const expected4088Corrections: ExpectedCorrection[] = [
  {
    fiscalPeriodEnd: "2024-06-30",
    quarter: 1,
    operatingCF: 27_430_000_000,
    investingCF: -17_997_000_000,
    financingCF: -10_992_000_000,
  },
  {
    fiscalPeriodEnd: "2024-12-31",
    quarter: 3,
    operatingCF: 60_461_000_000,
    investingCF: -52_490_000_000,
    financingCF: -9_235_000_000,
  },
  {
    fiscalPeriodEnd: "2025-06-30",
    quarter: 1,
    operatingCF: 20_840_000_000,
    investingCF: -20_209_000_000,
    financingCF: -9_857_000_000,
  },
];

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: ${String(actual)} != ${String(expected)}`);
  }
}

async function loadQuarterlyByDisclosure(sourceDocumentId: string) {
  const { data: disclosure, error: disclosureError } = await supabaseAdmin
    .from("company_disclosures")
    .select("id, company_id, ticker, fiscal_period_end, quarter, accounting_scope")
    .eq("source", "tdnet")
    .eq("source_document_id", sourceDocumentId)
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

  return { disclosure, row };
}

async function verifyTempos() {
  const result = await loadQuarterlyByDisclosure("140120260727500039");
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
    assertEqual(`2751 ${name}`, result.row[name as keyof typeof result.row], value);
  }
  assertEqual(
    "2751 extraction_version",
    result.row.extraction_version,
    "tdnet-quarterly-v5-text-block-cf"
  );
  return result;
}

async function verifyKnownAnnualCashFlows() {
  const cases = [
    {
      sourceDocumentId: "140120260728500994",
      ticker: "9267",
      operatingCF: 16_975_000_000,
      investingCF: -20_278_000_000,
      financingCF: 4_947_000_000,
    },
    {
      sourceDocumentId: "140120260730503307",
      ticker: "7962",
      operatingCF: 2_114_256_000,
      investingCF: -550_214_000,
      financingCF: -1_876_529_000,
    },
  ];

  const results: Array<Record<string, unknown>> = [];
  for (const expected of cases) {
    const result = await loadQuarterlyByDisclosure(expected.sourceDocumentId);
    assertEqual(`${expected.ticker} ticker`, result.disclosure.ticker, expected.ticker);
    assertEqual(`${expected.ticker} operating_cf`, result.row.operating_cf, expected.operatingCF);
    assertEqual(`${expected.ticker} investing_cf`, result.row.investing_cf, expected.investingCF);
    assertEqual(`${expected.ticker} financing_cf`, result.row.financing_cf, expected.financingCF);
    assertEqual(
      `${expected.ticker} extraction_version`,
      result.row.extraction_version,
      "tdnet-quarterly-v5-text-block-cf"
    );
    results.push(result);
  }
  return results;
}

async function verify4088Corrections() {
  const { data: disclosures, error: disclosureError } = await supabaseAdmin
    .from("company_disclosures")
    .select("id, company_id, ticker, title, fiscal_period_end, quarter, accounting_scope")
    .eq("source", "tdnet")
    .eq("ticker", "4088")
    .eq("document_type", "correction")
    .gte("disclosed_at", "2026-07-31T00:00:00+09:00")
    .lt("disclosed_at", "2026-08-01T00:00:00+09:00");
  if (disclosureError) throw disclosureError;

  const results: Array<Record<string, unknown>> = [];
  for (const expected of expected4088Corrections) {
    const disclosure = (disclosures ?? []).find(
      (row) => row.fiscal_period_end === expected.fiscalPeriodEnd
    );
    if (!disclosure) {
      throw new Error(`4088 correction not found: ${expected.fiscalPeriodEnd}`);
    }

    assertEqual(`4088 ${expected.fiscalPeriodEnd} quarter`, disclosure.quarter, expected.quarter);

    const { data: row, error: rowError } = await supabaseAdmin
      .from("company_quarterly_financials")
      .select("quarter, operating_cf, investing_cf, financing_cf, extraction_version")
      .eq("company_id", disclosure.company_id)
      .eq("fiscal_period_end", expected.fiscalPeriodEnd)
      .eq("quarter", expected.quarter)
      .eq("accounting_scope", disclosure.accounting_scope ?? "unknown")
      .single();
    if (rowError) throw rowError;

    assertEqual(`4088 ${expected.fiscalPeriodEnd} row quarter`, row.quarter, expected.quarter);
    assertEqual(
      `4088 ${expected.fiscalPeriodEnd} operating_cf`,
      row.operating_cf,
      expected.operatingCF
    );
    assertEqual(
      `4088 ${expected.fiscalPeriodEnd} investing_cf`,
      row.investing_cf,
      expected.investingCF
    );
    assertEqual(
      `4088 ${expected.fiscalPeriodEnd} financing_cf`,
      row.financing_cf,
      expected.financingCF
    );
    assertEqual(
      `4088 ${expected.fiscalPeriodEnd} extraction_version`,
      row.extraction_version,
      "tdnet-quarterly-v5-text-block-cf"
    );

    results.push({ disclosure, row });
  }

  return results;
}

async function main() {
  const tempos = await verifyTempos();
  const annualCashFlows = await verifyKnownAnnualCashFlows();
  const corrections = await verify4088Corrections();
  console.log(
    JSON.stringify(
      {
        status: "success",
        tempos,
        annualCashFlows,
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
