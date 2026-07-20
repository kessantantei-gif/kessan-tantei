import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";
import { supabaseAdmin } from "../lib/supabase";

type SearchRow = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
  risk_level: string | null;
};

const REQUIRED_MARKETS = ["prime", "standard", "growth"] as const;

async function main() {
  const rows = await loadAllSupabaseRows<SearchRow>(
    "全市場検索監査データ取得失敗",
    (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, market_segment, risk_level")
        .neq("risk_level", "EXCLUDED")
        .order("ticker", { ascending: true })
        .range(from, to)
  );

  const searchable = rows.filter(
    (row) =>
      REQUIRED_MARKETS.includes(
        row.market_segment as (typeof REQUIRED_MARKETS)[number]
      ) &&
      Boolean(row.ticker) &&
      Boolean(row.company_name)
  );

  const counts = Object.fromEntries(
    REQUIRED_MARKETS.map((market) => [
      market,
      searchable.filter((row) => row.market_segment === market).length,
    ])
  );
  const duplicateTickers = [...new Set(
    searchable
      .map((row) => row.ticker)
      .filter(
        (ticker, index, tickers) => tickers.indexOf(ticker) !== index
      )
  )];
  const failures: string[] = [];

  for (const market of REQUIRED_MARKETS) {
    if ((counts[market] ?? 0) === 0) {
      failures.push(`${market} has no searchable companies`);
    }
  }
  if (duplicateTickers.length > 0) {
    failures.push(`duplicate tickers: ${duplicateTickers.join(", ")}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    totalSearchableCompanies: searchable.length,
    counts,
    duplicateTickers,
    failures,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/global-company-search-audit.json",
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("===== Global company search audit =====");
  console.log(report);

  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Global company search audit failed", error);
  process.exit(1);
});
