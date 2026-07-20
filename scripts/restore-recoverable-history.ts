import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";
import { calculateMarketScores } from "../lib/market-scoring-engine";

type Json = Record<string, unknown>;
type Analysis = {
  ticker: string;
  company_name: string;
  financials: Json | null;
  history: Json[] | null;
};
type Company = {
  id: string;
  ticker: string;
  market_segment: "prime" | "standard" | "growth" | "other";
};
type Period = {
  company_id: string;
  fiscal_year: number | null;
  period_end: string | null;
  document_id: string | null;
  financials: Json | null;
  source_payload: Json | null;
  source_position: number | null;
};

function validRows(rows: Json[] | null | undefined) {
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
}

function periodKey(row: Json) {
  return String(
    row.periodEnd ?? row.period_end ?? row.fiscalPeriod ?? row.fiscal_period ?? row.fiscalYear ?? row.fiscal_year ?? row.year ?? ""
  );
}

function metricCount(row: Json) {
  return ["revenue", "operatingIncome", "operatingCF", "cash", "assets", "netAssets"]
    .filter((key) => typeof row[key] === "number" && Number.isFinite(row[key])).length;
}

function normalizePeriod(row: Period): Json {
  const base = row.financials ?? row.source_payload ?? {};
  const periodEnd =
    (typeof base.periodEnd === "string" && base.periodEnd) ||
    (typeof base.period_end === "string" && base.period_end) ||
    row.period_end ||
    null;
  const fiscalYear =
    (typeof base.fiscalYear === "number" && base.fiscalYear) ||
    (typeof base.fiscal_year === "number" && base.fiscal_year) ||
    row.fiscal_year ||
    (periodEnd ? Number(periodEnd.slice(0, 4)) : null);

  return {
    ...base,
    year: String(fiscalYear ?? base.year ?? ""),
    fiscalYear,
    periodEnd,
    docID:
      (typeof base.docID === "string" && base.docID) ||
      (typeof base.document_id === "string" && base.document_id) ||
      row.document_id,
  };
}

function mergePeriods(rows: Json[]) {
  const byPeriod = new Map<string, Json>();
  for (const row of rows) {
    const key = periodKey(row);
    if (!key) continue;
    const current = byPeriod.get(key);
    if (!current || metricCount(row) > metricCount(current)) byPeriod.set(key, row);
  }
  return [...byPeriod.values()]
    .sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
    .slice(-3);
}

async function main() {
  const [analyses, companies, periods] = await Promise.all([
    loadAllSupabaseRows<Analysis>("分析取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, financials, history")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Company>("会社取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("id, ticker, market_segment")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Period>("正規化履歴取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_financial_periods")
        .select("company_id, fiscal_year, period_end, document_id, financials, source_payload, source_position")
        .order("company_id", { ascending: true })
        .order("period_end", { ascending: true })
        .range(from, to)
    ),
  ]);

  const companyByTicker = new Map(companies.map((row) => [row.ticker, row]));
  const periodsByCompany = new Map<string, Period[]>();
  for (const row of periods) {
    const list = periodsByCompany.get(row.company_id) ?? [];
    list.push(row);
    periodsByCompany.set(row.company_id, list);
  }

  const targets = analyses.flatMap((analysis) => {
    const company = companyByTicker.get(analysis.ticker);
    if (!company) return [];
    const before = validRows(analysis.history);
    const normalized = mergePeriods((periodsByCompany.get(company.id) ?? []).map(normalizePeriod));
    if (normalized.length < 2 || normalized.length <= before.length) return [];
    return [{ analysis, company, beforeCount: before.length, history: normalized }];
  });

  console.log("===== 復元対象限定・複数期履歴復元 =====");
  console.log({ targets: targets.length, untouched: analyses.length - targets.length });

  const repaired: Array<{ ticker: string; before: number; after: number }> = [];
  const failures: Array<{ ticker: string; error: string }> = [];

  for (const target of targets) {
    try {
      const scores = calculateMarketScores(
        target.company.market_segment,
        (target.analysis.financials ?? {}) as Parameters<typeof calculateMarketScores>[1],
        target.history as Parameters<typeof calculateMarketScores>[2]
      );

      const { error } = await supabaseAdmin
        .from("company_analyses")
        .update({
          history: target.history,
          score: scores.totalScore,
          score_breakdown: {
            growth: scores.growthScore,
            quality: scores.qualityScore,
            safety: scores.safetyScore,
            completenessPenalty: scores.completenessPenalty,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("ticker", target.analysis.ticker);
      if (error) throw error;

      repaired.push({
        ticker: target.analysis.ticker,
        before: target.beforeCount,
        after: target.history.length,
      });
      console.log(`[OK] ${target.analysis.ticker} ${target.beforeCount}期 → ${target.history.length}期`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ ticker: target.analysis.ticker, error: message });
      console.error(`[FAIL] ${target.analysis.ticker}: ${message}`);
    }
  }

  const kioxia = repaired.find((row) => row.ticker === "285A") ?? null;
  const reportPath = path.join(
    process.cwd(),
    "logs",
    `recoverable-history-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        targets: targets.length,
        repaired: repaired.length,
        failures: failures.length,
        untouched: analyses.length - targets.length,
        kioxia,
        repairedRows: repaired,
        failureRows: failures,
      },
      null,
      2
    )
  );

  console.log("===== 復元結果 =====");
  console.log({
    targets: targets.length,
    repaired: repaired.length,
    failures: failures.length,
    untouched: analyses.length - targets.length,
    kioxia,
    reportPath,
  });
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
