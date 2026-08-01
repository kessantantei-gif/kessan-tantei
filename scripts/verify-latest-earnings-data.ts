import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

const earningsTypes = [
  "q1_earnings",
  "q2_earnings",
  "q3_earnings",
  "annual_earnings",
  "correction",
];

type DisclosureRow = {
  id: string;
  ticker: string;
  title: string;
  disclosed_at: string;
  document_type: string;
  source_url: string | null;
  pdf_url: string | null;
  xbrl_url: string | null;
};

type CompanyRow = {
  ticker: string;
  company_name: string;
  market_segment: string;
};

type QuarterlyRow = {
  disclosure_id: string;
  revenue: number | null;
  operating_income: number | null;
  ordinary_income: number | null;
  profit_attributable_to_owners: number | null;
  operating_cf: number | null;
};

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadDisclosures() {
  const { data, error } = await supabaseAdmin
    .from("company_disclosures")
    .select(
      "id, ticker, title, disclosed_at, document_type, source_url, pdf_url, xbrl_url"
    )
    .eq("source", "tdnet")
    .in("document_type", earningsTypes)
    .not("ticker", "is", null)
    .order("disclosed_at", { ascending: false })
    .limit(120);

  if (error) throw new Error(`最新決算開示取得失敗: ${error.message}`);
  return (data ?? []) as DisclosureRow[];
}

async function loadCompanies(tickers: string[]) {
  const uniqueTickers = [...new Set(tickers)];
  const rows: CompanyRow[] = [];

  for (const batch of chunk(uniqueTickers, 60)) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, market_segment")
      .eq("listing_status", "listed")
      .in("ticker", batch);
    if (error) throw new Error(`最新決算企業マスタ取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as CompanyRow[]));
  }

  return rows;
}

async function loadQuarterlyRows(disclosureIds: string[]) {
  const rows: QuarterlyRow[] = [];

  for (const batch of chunk(disclosureIds, 40)) {
    const { data, error } = await supabaseAdmin
      .from("company_quarterly_financials")
      .select(
        "disclosure_id, revenue, operating_income, ordinary_income, profit_attributable_to_owners, operating_cf"
      )
      .in("disclosure_id", batch);
    if (error) throw new Error(`最新決算四半期数値取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as QuarterlyRow[]));
  }

  return rows;
}

function hasNumericFinancials(row: QuarterlyRow) {
  return [
    row.revenue,
    row.operating_income,
    row.ordinary_income,
    row.profit_attributable_to_owners,
    row.operating_cf,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

async function main() {
  const disclosures = await loadDisclosures();
  if (disclosures.length === 0) {
    throw new Error("最新決算ハブに表示できるTDnet決算短信が0件です");
  }

  const [companies, quarterlyRows] = await Promise.all([
    loadCompanies(disclosures.map((row) => row.ticker)),
    loadQuarterlyRows(disclosures.map((row) => row.id)),
  ]);

  const companyByTicker = new Map(companies.map((row) => [row.ticker, row]));
  const listedDisclosures = disclosures.filter((row) => companyByTicker.has(row.ticker));
  const visibleDisclosures = listedDisclosures.slice(0, 100);
  const visibleIds = new Set(visibleDisclosures.map((row) => row.id));
  const visibleQuarterlyRows = quarterlyRows.filter((row) => visibleIds.has(row.disclosure_id));
  const numericRows = visibleQuarterlyRows.filter(hasNumericFinancials);
  const officialLinkCount = visibleDisclosures.filter(
    (row) => row.pdf_url || row.xbrl_url || row.source_url
  ).length;
  const uniqueMarkets = [...new Set(companies.map((row) => row.market_segment))].sort();

  if (visibleDisclosures.length === 0) {
    throw new Error("TDnet決算短信と上場企業マスタの一致が0件です");
  }
  if (officialLinkCount === 0) {
    throw new Error("最新決算ハブに表示できる公式開示リンクが0件です");
  }
  if (numericRows.length === 0) {
    throw new Error("最新決算ハブに表示できる財務数値が0件です");
  }

  const report = {
    checkedAt: new Date().toISOString(),
    tdnetDisclosures: disclosures.length,
    listedCompanyMatches: listedDisclosures.length,
    visibleDisclosures: visibleDisclosures.length,
    officialLinkCount,
    quarterlyRowsMatchedByDisclosure: visibleQuarterlyRows.length,
    numericFinancialRows: numericRows.length,
    marketSegments: uniqueMarkets,
    latestSamples: visibleDisclosures.slice(0, 5).map((row) => ({
      ticker: row.ticker,
      companyName: companyByTicker.get(row.ticker)?.company_name ?? null,
      documentType: row.document_type,
      title: row.title,
      disclosedAt: row.disclosed_at,
      hasOfficialLink: Boolean(row.pdf_url || row.xbrl_url || row.source_url),
      hasNumericFinancials: visibleQuarterlyRows
        .filter((quarterly) => quarterly.disclosure_id === row.id)
        .some(hasNumericFinancials),
    })),
  };

  console.log("===== Latest earnings data verification =====");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
