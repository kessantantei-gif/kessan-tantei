import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { calculateScores } from "../lib/scoring-engine";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

config({ path: ".env.local" });

type JsonObject = Record<string, unknown>;
type HistoryRow = JsonObject & {
  year?: string | number;
  fiscalYear?: string | number;
  periodEnd?: string;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
  operatingCF?: number | null;
};

type CompanyRow = {
  ticker: string;
  company_name: string | null;
  financials: JsonObject | null;
  history: HistoryRow[] | null;
  score: number | null;
  score_breakdown: JsonObject | null;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase production credentials are missing");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function ratio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const result = (numerator / denominator) * 100;
  return Number.isFinite(result) ? round2(result) : null;
}

function growth(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous <= 0) return null;
  if (Math.abs(previous) < 1_000_000) return null;
  const result = ((current - previous) / previous) * 100;
  if (!Number.isFinite(result) || Math.abs(result) > 2_000) return null;
  return round2(result);
}

function sortedHistory(history: HistoryRow[]) {
  return [...history].sort((a, b) => {
    const left = a.periodEnd ?? String(a.fiscalYear ?? a.year ?? "");
    const right = b.periodEnd ?? String(b.fiscalYear ?? b.year ?? "");
    return left.localeCompare(right);
  });
}

function nullifyZero(source: JsonObject, field: string, repairs: string[]) {
  if (source[field] === 0) {
    source[field] = null;
    repairs.push(`${field}:0->null`);
  }
}

function sanitizeFinancials(source: JsonObject, history: HistoryRow[], repairs: string[]) {
  const financials: JsonObject = { ...source };

  for (const field of [
    "revenue",
    "assets",
    "currentAssets",
    "currentLiabilities",
    "cash",
    "cashAndDeposits",
    "netAssets",
    "equityAmount",
  ]) {
    nullifyZero(financials, field, repairs);
  }

  const assets = finite(financials.assets);
  const currentAssets = finite(financials.currentAssets);
  const currentLiabilities = finite(financials.currentLiabilities);
  const cash = finite(financials.cash ?? financials.cashAndDeposits);
  const netAssets = finite(financials.netAssets ?? financials.equityAmount);
  const revenue = finite(financials.revenue);
  const grossProfit = finite(financials.grossProfit);

  if (assets !== null && assets < 0) {
    financials.assets = null;
    repairs.push("assets:negative->null");
  }
  if (currentAssets !== null && currentAssets < 0) {
    financials.currentAssets = null;
    repairs.push("currentAssets:negative->null");
  }
  if (currentLiabilities !== null && currentLiabilities < 0) {
    financials.currentLiabilities = null;
    repairs.push("currentLiabilities:negative->null");
  }
  if (assets !== null && cash !== null && cash > assets * 1.05) {
    financials.cash = null;
    financials.cashAndDeposits = null;
    repairs.push("cash:impossible->null");
  }
  if (assets !== null && netAssets !== null && netAssets > assets * 1.05) {
    financials.netAssets = null;
    financials.equityAmount = null;
    repairs.push("netAssets:impossible->null");
  }
  if (revenue !== null && grossProfit !== null && grossProfit > revenue * 1.02) {
    financials.grossProfit = null;
    repairs.push("grossProfit:impossible->null");
  }

  const latest = history.at(-1) ?? {};
  const previous = history.at(-2) ?? {};
  const revenueNow = finite(financials.revenue);
  const operatingIncome = finite(financials.operatingIncome);
  const operatingCF = finite(financials.operatingCF);
  const netIncome = finite(financials.netIncome);
  const grossProfitNow = finite(financials.grossProfit);
  const assetsNow = finite(financials.assets);
  const netAssetsNow = finite(financials.netAssets ?? financials.equityAmount);
  const cashNow = finite(financials.cash ?? financials.cashAndDeposits);
  const liabilitiesNow = finite(financials.currentLiabilities);

  financials.operatingMargin = ratio(operatingIncome, revenueNow);
  financials.grossMargin = ratio(grossProfitNow, revenueNow);
  financials.netMargin = ratio(netIncome, revenueNow);
  financials.operatingCFMargin = ratio(operatingCF, revenueNow);
  financials.ocfMargin = financials.operatingCFMargin;
  financials.equityRatio = ratio(netAssetsNow, assetsNow);
  financials.cashRatio = ratio(cashNow, liabilitiesNow);
  financials.totalAssetTurnover =
    revenueNow !== null && assetsNow !== null && assetsNow > 0
      ? round2(revenueNow / assetsNow)
      : null;

  financials.revenueGrowth = growth(finite(latest.revenue), finite(previous.revenue));
  financials.grossProfitGrowth = growth(finite(latest.grossProfit), finite(previous.grossProfit));
  financials.operatingIncomeGrowth = growth(
    finite(latest.operatingIncome),
    finite(previous.operatingIncome)
  );
  financials.netIncomeGrowth = growth(finite(latest.netIncome), finite(previous.netIncome));
  financials.operatingCFGrowth = growth(finite(latest.operatingCF), finite(previous.operatingCF));
  financials.dataQuality =
    revenueNow === null || assetsNow === null ? "incomplete" : "complete";

  return financials;
}

async function main() {
  const companies = await loadAllSupabaseRows<CompanyRow>(
    "コア財務修復対象取得失敗",
    (from, to) =>
      supabase
        .from("company_analyses")
        .select("ticker, company_name, financials, history, score, score_breakdown")
        .order("ticker", { ascending: true })
        .range(from, to)
  );

  let updated = 0;
  const repairLog: Array<{ ticker: string; repairs: string[] }> = [];

  for (const company of companies) {
    const history = sortedHistory(Array.isArray(company.history) ? company.history : []);
    const repairs: string[] = [];
    const financials = sanitizeFinancials(company.financials ?? {}, history, repairs);
    const scores = calculateScores(
      financials as Parameters<typeof calculateScores>[0],
      history as Parameters<typeof calculateScores>[1]
    );
    const scoreBreakdown = {
      growth: scores.growthScore,
      quality: scores.qualityScore,
      safety: scores.safetyScore,
    };

    const changed =
      repairs.length > 0 ||
      JSON.stringify(history) !== JSON.stringify(company.history ?? []) ||
      JSON.stringify(financials) !== JSON.stringify(company.financials ?? {}) ||
      company.score !== scores.totalScore ||
      JSON.stringify(company.score_breakdown ?? {}) !== JSON.stringify(scoreBreakdown);

    if (!changed) continue;

    const { error: updateError } = await supabase
      .from("company_analyses")
      .update({
        history,
        financials,
        score: scores.totalScore,
        score_breakdown: scoreBreakdown,
        updated_at: new Date().toISOString(),
      })
      .eq("ticker", company.ticker);

    if (updateError) throw new Error(`${company.ticker}: ${updateError.message}`);
    updated += 1;
    if (repairs.length > 0) repairLog.push({ ticker: company.ticker, repairs });
  }

  console.log("=== core financial repair ===");
  console.log({
    totalCompanies: companies.length,
    updatedCompanies: updated,
    repairedCompanies: repairLog.length,
  });
  for (const item of repairLog) console.log(JSON.stringify(item));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
