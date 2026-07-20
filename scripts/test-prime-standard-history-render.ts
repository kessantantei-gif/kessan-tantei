import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

type HistoryRow = {
  year?: number;
  fiscalYear?: number;
  fiscalPeriod?: string;
  periodEnd?: string;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type Target = {
  ticker: string;
  expectedMarket: "prime" | "standard";
};

const targets: Target[] = [
  { ticker: "7203", expectedMarket: "prime" },
  { ticker: "2782", expectedMarket: "standard" },
];

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

async function main() {
  const results = [];

  for (const target of targets) {
    const [{ data: analysis, error: analysisError }, { data: market, error: marketError }] =
      await Promise.all([
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, company_name, history")
          .eq("ticker", target.ticker)
          .maybeSingle(),
        supabaseAdmin
          .from("all_market_companies")
          .select("ticker, market_segment")
          .eq("ticker", target.ticker)
          .maybeSingle(),
      ]);

    if (analysisError) throw analysisError;
    if (marketError) throw marketError;

    const history = Array.isArray(analysis?.history)
      ? (analysis.history as HistoryRow[])
      : [];

    const response = await fetch(`https://kessan-tantei.jp/company/${target.ticker}`, {
      cache: "no-store",
      headers: { "user-agent": "kessan-tantei-history-check/1.0" },
    });
    const html = await response.text();

    const expectedStrings = history.flatMap((row) =>
      [periodLabel(row), yenOku(row.revenue), yenOku(row.operatingIncome), yenOku(row.operatingCF)].filter(
        (value): value is string => Boolean(value)
      )
    );

    const missing = expectedStrings.filter((value) => !html.includes(value));

    results.push({
      ticker: target.ticker,
      companyName: analysis?.company_name ?? null,
      expectedMarket: target.expectedMarket,
      actualMarket: market?.market_segment ?? null,
      historyPeriods: history.length,
      httpStatus: response.status,
      expectedStrings,
      missing,
      rendered: response.ok && history.length >= 3 && missing.length === 0,
    });
  }

  console.dir(results, { depth: null });

  if (results.some((result) => !result.rendered)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
