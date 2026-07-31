import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

const TARGET_TICKERS = ["4069", "6908", "6111", "8071"];
const TARGET_DATE = "2026-07-30";
const JST_START = "2026-07-29T15:00:00.000Z";
const JST_END = "2026-07-30T15:00:00.000Z";

function cleanText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(base: string, href: string) {
  return new URL(href.replace(/&amp;/g, "&"), base).toString();
}

function normalizeTicker(value: string) {
  const match = value.normalize("NFKC").match(/(?:^|\D)([0-9A-Z]{4})(?:0)?(?:\D|$)/i);
  return match?.[1]?.toUpperCase() ?? "";
}

async function inspectTdnetRows() {
  const rows: Array<{
    page: number;
    ticker: string;
    text: string;
    anchors: Array<{ text: string; href: string }>;
  }> = [];

  for (let page = 1; page <= 50; page += 1) {
    const pageText = String(page).padStart(3, "0");
    const url = `https://www.release.tdnet.info/inbs/I_list_${pageText}_${TARGET_DATE.replace(/-/g, "")}.html`;
    const response = await fetch(url, {
      headers: { "user-agent": "kessan-tantei-tdnet-inspection/1.0" },
    });
    if (!response.ok) {
      if (response.status !== 404) throw new Error(`${url}: ${response.status}`);
      break;
    }

    const html = await response.text();
    for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row = match[1];
      const text = cleanText(row);
      const ticker = normalizeTicker(text);
      if (!TARGET_TICKERS.includes(ticker)) continue;
      const anchors = [...row.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(
        (anchor) => ({
          href: absoluteUrl(url, anchor[1]),
          text: cleanText(anchor[2]),
        })
      );
      rows.push({ page, ticker, text, anchors });
    }
  }

  return rows;
}

async function main() {
  const [tdnetRows, companyResult, disclosureResult, quarterlyResult] = await Promise.all([
    inspectTdnetRows(),
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, market, listing_status")
      .in("ticker", TARGET_TICKERS)
      .order("ticker", { ascending: true }),
    supabaseAdmin
      .from("company_disclosures")
      .select(
        "id, ticker, title, document_type, disclosed_at, fiscal_year, fiscal_period_end, quarter, accounting_scope, source_document_id, source_url, xbrl_url, pdf_url, raw_payload"
      )
      .eq("source", "tdnet")
      .in("ticker", ["4069", "6908"])
      .gte("disclosed_at", JST_START)
      .lt("disclosed_at", JST_END)
      .order("ticker", { ascending: true }),
    supabaseAdmin
      .from("company_quarterly_financials")
      .select(
        "id, ticker, disclosure_id, fiscal_year, fiscal_period_end, quarter, accounting_scope, revenue, operating_income, ordinary_income, profit_attributable_to_owners, extraction_version, updated_at"
      )
      .in("ticker", ["4069", "6908"])
      .order("updated_at", { ascending: false }),
  ]);

  if (companyResult.error) throw new Error(`会社取得失敗: ${companyResult.error.message}`);
  if (disclosureResult.error) throw new Error(`開示取得失敗: ${disclosureResult.error.message}`);
  if (quarterlyResult.error) throw new Error(`四半期取得失敗: ${quarterlyResult.error.message}`);

  console.log("===== TDnet missing-row detailed inspection =====");
  console.log(
    JSON.stringify(
      {
        targetDate: TARGET_DATE,
        targetTickers: TARGET_TICKERS,
        companyMaster: companyResult.data ?? [],
        tdnetRows,
        disclosures: disclosureResult.data ?? [],
        quarterlyRows: quarterlyResult.data ?? [],
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
