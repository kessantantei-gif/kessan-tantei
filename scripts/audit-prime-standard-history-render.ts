import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type HistoryRow = {
  year?: number;
  fiscalYear?: number;
  fiscalPeriod?: string;
  periodEnd?: string;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type AnalysisRow = {
  ticker: string;
  company_name: string | null;
  history: HistoryRow[] | null;
};

type MarketRow = {
  ticker: string;
  market_segment: string | null;
};

const namedTickers = new Set(["285A", "8360"]);

function periodLabel(row: HistoryRow) {
  if (row.fiscalPeriod) return row.fiscalPeriod;
  if (row.periodEnd) {
    const date = new Date(`${row.periodEnd}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月期`;
    }
  }
  const year = row.fiscalYear ?? row.year;
  return year ? `${year}年期` : "決算期不明";
}

function yenOku(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return `${(number / 100000000).toFixed(2)} 億円`;
}

async function checkCompany(
  analysis: AnalysisRow,
  market: string,
  index: number,
  total: number
) {
  const history = Array.isArray(analysis.history) ? analysis.history.slice(-3) : [];
  const response = await fetch(`https://kessan-tantei.jp/company/${analysis.ticker}`, {
    cache: "no-store",
    headers: { "user-agent": "kessan-tantei-all-market-history-audit/1.0" },
  });
  const html = await response.text();

  const expectedStrings = history.flatMap((row) =>
    [periodLabel(row), yenOku(row.revenue), yenOku(row.operatingIncome), yenOku(row.operatingCF)].filter(
      (value): value is string => Boolean(value)
    )
  );
  const missing = expectedStrings.filter((value) => !html.includes(value));
  const rendered = response.ok && history.length >= 3 && missing.length === 0;

  const result = {
    ticker: analysis.ticker,
    companyName: analysis.company_name,
    market,
    historyPeriods: history.length,
    httpStatus: response.status,
    missing,
    rendered,
  };

  if (!rendered || namedTickers.has(analysis.ticker)) {
    console.dir({ progress: `${index + 1}/${total}`, ...result }, { depth: null });
  }

  return result;
}

async function main() {
  const [analyses, markets] = await Promise.all([
    loadAllSupabaseRows<AnalysisRow>("company_analyses取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, history")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<MarketRow>("all_market_companies取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("ticker, market_segment")
        .in("market_segment", ["prime", "standard"])
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
  ]);

  const marketMap = new Map(markets.map((row) => [row.ticker, row.market_segment ?? "unknown"]));
  const targets = analyses.filter((row) => {
    const market = marketMap.get(row.ticker);
    return Boolean(market && Array.isArray(row.history) && row.history.length >= 3);
  });

  const results: Awaited<ReturnType<typeof checkCompany>>[] = [];
  const concurrency = 8;

  for (let start = 0; start < targets.length; start += concurrency) {
    const chunk = targets.slice(start, start + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((analysis, offset) =>
        checkCompany(
          analysis,
          marketMap.get(analysis.ticker) ?? "unknown",
          start + offset,
          targets.length
        )
      )
    );
    results.push(...chunkResults);
  }

  const named = results.filter((row) => namedTickers.has(row.ticker));
  const failures = results.filter((row) => !row.rendered);

  console.log("===== プライム・スタンダード 3期表示監査 =====");
  console.dir(
    {
      targets: targets.length,
      rendered: results.length - failures.length,
      failures: failures.length,
      named,
      failureRows: failures,
    },
    { depth: null }
  );

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
