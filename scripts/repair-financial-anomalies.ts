import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { calculateScores } from "../lib/scoring-engine";

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

type RepairLog = {
  ticker: string;
  companyName: string;
  field: string;
  before: unknown;
  after: unknown;
  reason: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase production credentials are missing");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const AMOUNT_FIELDS = [
  "revenue",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "operatingCF",
] as const;

const UNIT_FACTORS = [1, 1_000, 1_000_000, 0.001, 0.000001] as const;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function magnitudeRatio(a: number, b: number) {
  const aa = Math.abs(a);
  const bb = Math.abs(b);
  if (aa === 0 || bb === 0) return Infinity;
  return Math.max(aa, bb) / Math.min(aa, bb);
}

function bestScaledValue(value: number, reference: number) {
  let best = { value, factor: 1, ratio: magnitudeRatio(value, reference) };
  for (const factor of UNIT_FACTORS) {
    const candidate = value * factor;
    const ratio = magnitudeRatio(candidate, reference);
    if (ratio < best.ratio) best = { value: candidate, factor, ratio };
  }
  return best;
}

function sortedHistory(history: HistoryRow[]) {
  return [...history].sort((a, b) => {
    const aKey = a.periodEnd ?? String(a.fiscalYear ?? a.year ?? "");
    const bKey = b.periodEnd ?? String(b.fiscalYear ?? b.year ?? "");
    return aKey.localeCompare(bKey);
  });
}

function normalizeHistoryUnits(
  ticker: string,
  companyName: string,
  history: HistoryRow[],
  financials: JsonObject,
  logs: RepairLog[]
) {
  const rows = sortedHistory(history).map((row) => ({ ...row }));

  for (const field of AMOUNT_FIELDS) {
    const latestIndex = rows.length - 1;
    const latestValue = finite(rows[latestIndex]?.[field]);
    const currentValue = finite(financials[field]);

    if (latestValue !== null && currentValue !== null) {
      const ratio = magnitudeRatio(latestValue, currentValue);
      const scaled = bestScaledValue(latestValue, currentValue);
      if (ratio >= 100 && scaled.factor !== 1 && scaled.ratio <= 1.05) {
        rows[latestIndex][field] = scaled.value;
        logs.push({
          ticker,
          companyName,
          field: `history.latest.${field}`,
          before: latestValue,
          after: scaled.value,
          reason: `最新財務値との単位差を${scaled.factor}倍で補正`,
        });
      }
    }

    for (let index = rows.length - 2; index >= 0; index -= 1) {
      const value = finite(rows[index][field]);
      const reference = finite(rows[index + 1][field]);
      if (value === null || reference === null || value === 0 || reference === 0) continue;

      const originalRatio = magnitudeRatio(value, reference);
      if (originalRatio < 100) continue;

      const scaled = bestScaledValue(value, reference);
      if (scaled.factor !== 1 && scaled.ratio <= 20 && scaled.ratio * 20 < originalRatio) {
        rows[index][field] = scaled.value;
        logs.push({
          ticker,
          companyName,
          field: `history.${index}.${field}`,
          before: value,
          after: scaled.value,
          reason: `隣接年度との単位差を${scaled.factor}倍で補正`,
        });
      }
    }
  }

  return rows;
}

function safeGrowth(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous <= 0) return null;
  if (Math.abs(previous) < 1_000_000) return null;
  const growth = ((current - previous) / previous) * 100;
  if (!Number.isFinite(growth) || Math.abs(growth) > 2_000) return null;
  return round2(growth);
}

function safeRatio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const value = (numerator / denominator) * 100;
  return Number.isFinite(value) ? round2(value) : null;
}

function sanitizeFinancials(
  ticker: string,
  companyName: string,
  source: JsonObject,
  history: HistoryRow[],
  logs: RepairLog[]
) {
  const financials: JsonObject = { ...source };

  const invalidate = (field: string, reason: string) => {
    const before = financials[field];
    if (before !== null && before !== undefined) {
      financials[field] = null;
      logs.push({ ticker, companyName, field, before, after: null, reason });
    }
  };

  const assets = finite(financials.assets);
  const currentAssets = finite(financials.currentAssets);
  const currentLiabilities = finite(financials.currentLiabilities);
  const netAssets = finite(financials.netAssets ?? financials.equityAmount);
  const cash = finite(financials.cash ?? financials.cashAndDeposits);
  const revenue = finite(financials.revenue);
  const grossProfit = finite(financials.grossProfit);

  if (assets !== null && assets <= 0) invalidate("assets", "欠損を0として保存していたためnullへ修正");
  if (currentAssets !== null && currentAssets < 0) invalidate("currentAssets", "流動資産の不正な負値");
  if (currentLiabilities !== null && currentLiabilities < 0) invalidate("currentLiabilities", "流動負債の不正な負値");
  if (assets !== null && netAssets !== null && netAssets > assets * 1.05) {
    invalidate("netAssets", "純資産が総資産を上回る不整合");
    invalidate("equityAmount", "純資産が総資産を上回る不整合");
  }
  if (assets !== null && cash !== null && cash > assets * 1.05) {
    invalidate("cash", "現金が総資産を上回る単位不整合");
    invalidate("cashAndDeposits", "現金が総資産を上回る単位不整合");
  }
  if (revenue !== null && grossProfit !== null && grossProfit > revenue * 1.02) {
    invalidate("grossProfit", "売上総利益が売上高を上回る不整合");
  }

  const latest = history.at(-1) ?? {};
  const previous = history.at(-2) ?? {};

  for (const field of AMOUNT_FIELDS) {
    const latestValue = finite(latest[field]);
    const currentValue = finite(financials[field]);
    if (latestValue === null || currentValue === null || latestValue === 0 || currentValue === 0) continue;
    const originalRatio = magnitudeRatio(currentValue, latestValue);
    const scaled = bestScaledValue(currentValue, latestValue);
    if (originalRatio >= 100 && scaled.factor !== 1 && scaled.ratio <= 1.05) {
      financials[field] = scaled.value;
      logs.push({
        ticker,
        companyName,
        field,
        before: currentValue,
        after: scaled.value,
        reason: `最新履歴との単位差を${scaled.factor}倍で補正`,
      });
    }
  }

  const revenueNow = finite(financials.revenue);
  const operatingIncome = finite(financials.operatingIncome);
  const operatingCF = finite(financials.operatingCF);
  const netIncome = finite(financials.netIncome);
  const grossProfitNow = finite(financials.grossProfit);
  const assetsNow = finite(financials.assets);
  const netAssetsNow = finite(financials.netAssets ?? financials.equityAmount);
  const cashNow = finite(financials.cash ?? financials.cashAndDeposits);
  const liabilitiesNow = finite(financials.currentLiabilities);

  financials.operatingMargin = safeRatio(operatingIncome, revenueNow);
  financials.grossMargin = safeRatio(grossProfitNow, revenueNow);
  financials.netMargin = safeRatio(netIncome, revenueNow);
  financials.operatingCFMargin = safeRatio(operatingCF, revenueNow);
  financials.ocfMargin = financials.operatingCFMargin;
  financials.equityRatio = safeRatio(netAssetsNow, assetsNow);
  financials.cashRatio = safeRatio(cashNow, liabilitiesNow);
  financials.totalAssetTurnover =
    revenueNow !== null && assetsNow !== null && assetsNow > 0
      ? round2(revenueNow / assetsNow)
      : null;

  financials.revenueGrowth = safeGrowth(finite(latest.revenue), finite(previous.revenue));
  financials.grossProfitGrowth = safeGrowth(finite(latest.grossProfit), finite(previous.grossProfit));
  financials.operatingIncomeGrowth = safeGrowth(
    finite(latest.operatingIncome),
    finite(previous.operatingIncome)
  );
  financials.netIncomeGrowth = safeGrowth(finite(latest.netIncome), finite(previous.netIncome));
  financials.operatingCFGrowth = safeGrowth(finite(latest.operatingCF), finite(previous.operatingCF));

  return financials;
}

async function main() {
  const { data, error } = await supabase
    .from("company_analyses")
    .select("ticker, company_name, financials, history, score, score_breakdown")
    .neq("risk_level", "EXCLUDED")
    .order("ticker", { ascending: true });

  if (error) throw error;

  const companies = (data ?? []) as CompanyRow[];
  const logs: RepairLog[] = [];
  let updated = 0;

  for (const company of companies) {
    const companyName = company.company_name ?? company.ticker;
    const originalHistory = Array.isArray(company.history) ? company.history : [];
    const originalFinancials = company.financials ?? {};
    const history = normalizeHistoryUnits(
      company.ticker,
      companyName,
      originalHistory,
      originalFinancials,
      logs
    );
    const financials = sanitizeFinancials(
      company.ticker,
      companyName,
      originalFinancials,
      history,
      logs
    );

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
      JSON.stringify(history) !== JSON.stringify(originalHistory) ||
      JSON.stringify(financials) !== JSON.stringify(originalFinancials) ||
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
  }

  console.log("=== financial anomaly repair ===");
  console.log({ totalCompanies: companies.length, updatedCompanies: updated, repairs: logs.length });
  for (const log of logs) console.log(JSON.stringify(log));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
