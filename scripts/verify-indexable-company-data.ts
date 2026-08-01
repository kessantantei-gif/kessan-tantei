import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

const DIRECTORY_PAGE_SIZE = 100;
const requiredMarkets = ["growth", "prime", "standard"] as const;

type ListedCompanyRow = {
  ticker: string;
  market_segment: string | null;
};

type AnalyzedCompanyRow = {
  ticker: string;
  market_segment: string | null;
  risk_level: string | null;
};

async function loadListedCompanies() {
  const rows: ListedCompanyRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("ticker, market_segment")
      .eq("listing_status", "listed")
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`上場企業マスタ取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as ListedCompanyRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function loadAnalyzedCompanies() {
  const rows: AnalyzedCompanyRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("company_analyses")
      .select("ticker, market_segment, risk_level")
      .neq("risk_level", "EXCLUDED")
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`分析済み企業取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as AnalyzedCompanyRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

function countByMarket(rows: Array<{ market_segment: string | null }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const market = row.market_segment || "unknown";
    counts.set(market, (counts.get(market) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const [listedCompanies, analyzedCompanies] = await Promise.all([
    loadListedCompanies(),
    loadAnalyzedCompanies(),
  ]);

  const listedTickers = new Set(listedCompanies.map((row) => row.ticker));
  const analyzedTickers = new Set(analyzedCompanies.map((row) => row.ticker));
  const indexableCompanies = analyzedCompanies.filter((row) => listedTickers.has(row.ticker));
  const indexableTickers = new Set(indexableCompanies.map((row) => row.ticker));
  const analyzedButNotListed = analyzedCompanies.filter((row) => !listedTickers.has(row.ticker));
  const preparationCount = listedCompanies.filter(
    (row) => !indexableTickers.has(row.ticker)
  ).length;
  const listedByMarket = countByMarket(listedCompanies);
  const indexableByMarket = countByMarket(indexableCompanies);
  const directoryPagesByMarket = Object.fromEntries(
    requiredMarkets.map((market) => [
      market,
      Math.ceil((indexableByMarket[market] ?? 0) / DIRECTORY_PAGE_SIZE),
    ])
  );

  if (listedCompanies.length === 0) {
    throw new Error("上場企業マスタが0件です");
  }
  if (analyzedCompanies.length === 0) {
    throw new Error("EXCLUDEDを除く分析済み企業が0件です");
  }
  if (indexableCompanies.length === 0) {
    throw new Error("サイトマップへ掲載可能な分析済み上場企業が0件です");
  }
  if (indexableCompanies.length > listedCompanies.length) {
    throw new Error("検索登録対象企業数が上場企業数を超えています");
  }
  if (analyzedTickers.size !== analyzedCompanies.length) {
    throw new Error("company_analysesに証券コードの重複があります");
  }

  for (const market of requiredMarkets) {
    if ((indexableByMarket[market] ?? 0) === 0) {
      throw new Error(`${market}市場の検索登録対象企業が0件です`);
    }
    if ((directoryPagesByMarket[market] ?? 0) === 0) {
      throw new Error(`${market}市場の企業一覧ページ数が0です`);
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    listedCompanies: listedCompanies.length,
    activeAnalyzedCompanies: analyzedCompanies.length,
    indexableListedCompanies: indexableCompanies.length,
    preparationCompaniesExcludedFromSitemap: preparationCount,
    analyzedButNotListed: analyzedButNotListed.length,
    listedByMarket,
    indexableByMarket,
    directoryPageSize: DIRECTORY_PAGE_SIZE,
    directoryPagesByMarket,
    totalDirectoryPages: Object.values(directoryPagesByMarket).reduce(
      (sum, value) => sum + value,
      0
    ),
    analyzedButNotListedSamples: analyzedButNotListed.slice(0, 10).map((row) => row.ticker),
  };

  console.log("===== Indexable company data verification =====");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
