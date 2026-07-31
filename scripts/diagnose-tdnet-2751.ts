import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import AdmZip from "adm-zip";
import { parseTdnetTextBlockFinancials } from "../lib/tdnet-text-block-financials";
import { supabaseAdmin } from "../lib/supabase";

const EXPECTED = {
  revenue: 53_408_000_000,
  operatingIncome: 2_890_000_000,
  ordinaryIncome: 3_107_000_000,
  profitAttributableToOwners: 1_894_000_000,
};

function clean(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const buffer = Buffer.from(await response.arrayBuffer());
  const zip = new AdmZip(buffer);
  const profitAndLossEntries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && /(?:acpl|qcpl).*?-ixbrl\.html?$/i.test(entry.entryName));

  const relevantRows: Array<{ entry: string; cells: string[] }> = [];
  for (const entry of profitAndLossEntries) {
    const document = entry.getData().toString("utf8");
    for (const row of document.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [
        ...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi),
      ].map((match) => clean(match[1]));
      if (/売上高|売上収益|営業利益|営業損失|経常利益|経常損失|親会社.*帰属/.test(cells.join(""))) {
        relevantRows.push({ entry: entry.entryName, cells });
      }
    }
  }

  const parsed = parseTdnetTextBlockFinancials(buffer);

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
        profitAndLossEntries: profitAndLossEntries.map((entry) => entry.entryName),
        relevantRows,
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
