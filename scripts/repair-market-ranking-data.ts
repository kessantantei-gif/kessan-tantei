import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { calculateFinancialMetrics, type FinancialFacts } from "../lib/financial-metrics";
import {
  extractFinancials,
  extractRowsFromEdinetCsvZip,
} from "../lib/edinet-financial-parser";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";
import { supabaseAdmin } from "../lib/supabase";

type MarketSegment = "prime" | "standard";

type MarketCompany = {
  ticker: string;
  company_name: string;
  market_segment: MarketSegment;
  is_reit: boolean | null;
  is_foreign: boolean | null;
};

type HistoryRow = {
  year?: string | number;
  fiscalYear?: string | number;
  fiscalMonth?: string | number;
  fiscalPeriod?: string;
  fiscal_period?: string;
  period?: string;
  periodEnd?: string;
  revenue?: number | null;
  grossProfit?: number | null;
  netIncome?: number | null;
  operatingIncome?: number | null;
  operatingCF?: number | null;
  [key: string]: unknown;
};

type AnalysisRow = {
  ticker: string;
  company_name: string;
  doc_id: string | null;
  financials: Record<string, unknown> | null;
  history: HistoryRow[] | null;
};

type RepairResult = {
  ticker: string;
  companyName: string;
  marketSegment: MarketSegment;
  status: "updated" | "skipped" | "failed";
  message: string;
};

const EDINET_BASE = "https://api.edinet-fsa.go.jp/api/v2";
const TARGET_MARKETS = new Set<MarketSegment>(["prime", "standard"]);

function parsePositiveInteger(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function selectedMarket(): MarketSegment | null {
  const raw = process.argv
    .find((value) => value.startsWith("--market="))
    ?.slice("--market=".length);
  return raw === "prime" || raw === "standard" ? raw : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function firstFinite(...values: unknown[]) {
  for (const value of values) {
    if (finite(value)) return value;
  }
  return null;
}

function mergedCurrentFacts(
  extracted: Partial<FinancialFacts>,
  stored: Record<string, unknown>
): FinancialFacts {
  return {
    revenue: firstFinite(extracted.revenue, stored.revenue),
    grossProfit: firstFinite(extracted.grossProfit, stored.grossProfit),
    netIncome: firstFinite(extracted.netIncome, stored.netIncome),
    operatingIncome: firstFinite(
      extracted.operatingIncome,
      stored.operatingIncome
    ),
    operatingCF: firstFinite(extracted.operatingCF, stored.operatingCF),
    cash: firstFinite(extracted.cash, stored.cash, stored.cashAndDeposits),
    currentLiabilities: firstFinite(
      extracted.currentLiabilities,
      stored.currentLiabilities
    ),
    assets: firstFinite(extracted.assets, stored.assets),
    netAssets: firstFinite(
      extracted.netAssets,
      stored.netAssets,
      stored.equityAmount
    ),
  };
}

function mergedPriorFacts(
  extracted: Partial<FinancialFacts>,
  history: HistoryRow[] | null
): FinancialFacts {
  const rows = Array.isArray(history)
    ? [...history].sort((left, right) => historyKey(left).localeCompare(historyKey(right)))
    : [];
  const prior = rows.at(-2) ?? {};

  return {
    revenue: firstFinite(extracted.revenue, prior.revenue),
    grossProfit: firstFinite(extracted.grossProfit, prior.grossProfit),
    netIncome: firstFinite(extracted.netIncome, prior.netIncome),
    operatingIncome: firstFinite(
      extracted.operatingIncome,
      prior.operatingIncome
    ),
    operatingCF: firstFinite(extracted.operatingCF, prior.operatingCF),
    cash: null,
    currentLiabilities: null,
    assets: null,
    netAssets: null,
  };
}

function historyYear(row: HistoryRow) {
  const value = Number(row.fiscalYear ?? row.year);
  return Number.isFinite(value) ? value : null;
}

function historyKey(row: HistoryRow) {
  if (typeof row.periodEnd === "string" && row.periodEnd) return row.periodEnd;
  const year = historyYear(row);
  return year === null ? "" : String(year).padStart(4, "0");
}

function rankingDataMissing(analysis: AnalysisRow) {
  const financials = analysis.financials ?? {};
  const history = Array.isArray(analysis.history) ? analysis.history : [];
  const grossHistoryCount = history.filter((row) => finite(row.grossProfit)).length;
  const netHistoryCount = history.filter((row) => finite(row.netIncome)).length;

  const grossMargin = finite(financials.grossMargin)
    ? financials.grossMargin
    : null;
  const netMargin = finite(financials.netMargin)
    ? financials.netMargin
    : null;
  const needsIfrsCorrection =
    financials.financialProfile === "ifrs" &&
    financials.marketRankingMetricsVersion !== 2;

  return (
    needsIfrsCorrection ||
    !finite(financials.grossProfit) ||
    !finite(financials.netIncome) ||
    grossMargin === null ||
    netMargin === null ||
    grossMargin > 105 ||
    netMargin > 300 ||
    grossHistoryCount < 2 ||
    netHistoryCount < 2
  );
}

function withFacts(row: HistoryRow, facts: Partial<FinancialFacts>) {
  const next = { ...row };
  const keys: Array<keyof FinancialFacts> = [
    "revenue",
    "grossProfit",
    "netIncome",
    "operatingIncome",
    "operatingCF",
  ];

  for (const key of keys) {
    const value = facts[key];
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      next[key] = value;
    }
  }

  return next;
}

function mergeHistory(
  history: HistoryRow[] | null,
  current: FinancialFacts,
  prior: FinancialFacts
) {
  const rows = Array.isArray(history)
    ? [...history].sort((left, right) => historyKey(left).localeCompare(historyKey(right)))
    : [];

  if (rows.length > 0) {
    rows[rows.length - 1] = withFacts(rows[rows.length - 1], current);
  }
  if (rows.length > 1) {
    rows[rows.length - 2] = withFacts(rows[rows.length - 2], prior);
  }

  return rows;
}

function hasRankingFacts(current: FinancialFacts, prior: FinancialFacts) {
  return [
    current.grossProfit,
    current.netIncome,
    prior.grossProfit,
    prior.netIncome,
  ].some(finite);
}

async function fetchCsvZip(docID: string) {
  const apiKey = process.env.EDINET_API_KEY;
  if (!apiKey) throw new Error("EDINET_API_KEY is missing");

  const url = `${EDINET_BASE}/documents/${docID}?type=5&Subscription-Key=${apiKey}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`EDINET CSV fetch failed: ${docID} ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 4 || buffer.subarray(0, 2).toString() !== "PK") {
        throw new Error(
          `EDINET CSV response is not ZIP: ${docID}, content-type=${response.headers.get("content-type")}, bytes=${buffer.length}`
        );
      }
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        const delay = attempt * 1500 + Math.floor(Math.random() * 500);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`EDINET CSV fetch failed: ${docID}`);
}

async function repairCompany(
  company: MarketCompany,
  analysis: AnalysisRow | undefined,
  force: boolean
): Promise<RepairResult> {
  if (!analysis?.doc_id) {
    return {
      ticker: company.ticker,
      companyName: company.company_name,
      marketSegment: company.market_segment,
      status: "skipped",
      message: "最新有報の書類IDがありません",
    };
  }

  if (!force && !rankingDataMissing(analysis)) {
    return {
      ticker: company.ticker,
      companyName: company.company_name,
      marketSegment: company.market_segment,
      status: "skipped",
      message: "ランキング用データは取得済みです",
    };
  }

  try {
    const zip = await fetchCsvZip(analysis.doc_id);
    const rows = extractRowsFromEdinetCsvZip(zip);
    const extracted = extractFinancials(rows);

    const current = mergedCurrentFacts(
      extracted.current,
      analysis.financials ?? {}
    );
    const prior = mergedPriorFacts(extracted.prior, analysis.history);

    if (!hasRankingFacts(current, prior)) {
      return {
        ticker: company.ticker,
        companyName: company.company_name,
        marketSegment: company.market_segment,
        status: "skipped",
        message: "有報に売上総利益・純利益の比較可能な数値がありません",
      };
    }

    const metrics = calculateFinancialMetrics(current, prior);
    const financials = {
      ...(analysis.financials ?? {}),
      ...extracted.metadata,
      ...metrics,
      marketRankingMetricsVersion: 2,
    };
    const history = mergeHistory(analysis.history, current, prior);

    const { error } = await supabaseAdmin
      .from("company_analyses")
      .update({
        financials,
        history,
        updated_at: new Date().toISOString(),
      })
      .eq("ticker", company.ticker);

    if (error) throw new Error(error.message);

    return {
      ticker: company.ticker,
      companyName: company.company_name,
      marketSegment: company.market_segment,
      status: "updated",
      message: "売上総利益・純利益と関連指標を補完しました",
    };
  } catch (error) {
    return {
      ticker: company.ticker,
      companyName: company.company_name,
      marketSegment: company.market_segment,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const concurrency = Math.min(8, parsePositiveInteger("concurrency", 4));
  const limit = parsePositiveInteger("limit", Number.MAX_SAFE_INTEGER);
  const market = selectedMarket();
  const force = process.argv.includes("--force");

  const [companies, analyses] = await Promise.all([
    loadAllSupabaseRows<MarketCompany>(
      "プライム・スタンダード会社取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select(
            "ticker, company_name, market_segment, is_reit, is_foreign"
          )
          .in("market_segment", ["prime", "standard"])
          .eq("listing_status", "listed")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
    loadAllSupabaseRows<AnalysisRow>(
      "プライム・スタンダード分析取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, company_name, doc_id, financials, history")
          .in("market_segment", ["prime", "standard"])
          .neq("risk_level", "EXCLUDED")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
  ]);

  const analysisByTicker = new Map(analyses.map((row) => [row.ticker, row]));
  const targets = companies
    .filter(
      (company) =>
        TARGET_MARKETS.has(company.market_segment) &&
        (!market || company.market_segment === market) &&
        company.is_reit !== true &&
        company.is_foreign !== true
    )
    .filter((company) => {
      const analysis = analysisByTicker.get(company.ticker);
      return force || !analysis || rankingDataMissing(analysis);
    })
    .slice(0, limit);

  console.log("===== Prime / Standard ranking data repair =====");
  console.log({
    targetMarkets: market ? [market] : ["prime", "standard"],
    targets: targets.length,
    concurrency,
    force,
  });

  const results: RepairResult[] = [];
  let nextIndex = 0;

  async function worker(workerNumber: number) {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= targets.length) return;

      const company = targets[index];
      const result = await repairCompany(
        company,
        analysisByTicker.get(company.ticker),
        force
      );
      results.push(result);
      console.log(
        `[${index + 1}/${targets.length} worker ${workerNumber}] ` +
          `${result.ticker} ${result.status}: ${result.message}`
      );
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, targets.length)) },
      (_, index) => worker(index + 1)
    )
  );

  const summary = {
    targets: targets.length,
    updated: results.filter((result) => result.status === "updated").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/market-ranking-data-repair.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2),
    "utf8"
  );

  console.log("===== repair result =====");
  console.log(summary);

  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Prime / Standard ranking data repair failed", error);
  process.exit(1);
});
