import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Json = Record<string, unknown>;

type AnalysisRow = {
  ticker: string;
  history: Json[] | null;
};

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateParts(row: Json) {
  const periodEnd = typeof row.periodEnd === "string" ? row.periodEnd : null;
  if (periodEnd) {
    const date = new Date(`${periodEnd}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        periodEnd,
      };
    }
  }

  const year = finiteNumber(row.year) ?? finiteNumber(row.fiscalYear);
  const month = finiteNumber(row.fiscalMonth) ?? 12;
  return {
    year,
    month,
    periodEnd,
  };
}

function normalizeHistory(history: Json[]) {
  const byPeriod = new Map<string, Json>();

  for (const row of history) {
    const { year, month, periodEnd } = dateParts(row);
    const fiscalPeriod =
      typeof row.fiscalPeriod === "string" && row.fiscalPeriod.trim()
        ? row.fiscalPeriod
        : year
          ? `${year}年${month}月期`
          : undefined;

    const normalized: Json = {
      ...row,
      ...(year ? { year, fiscalYear: year } : {}),
      ...(month ? { fiscalMonth: month } : {}),
      ...(fiscalPeriod ? { fiscalPeriod } : {}),
    };

    const key = String(periodEnd ?? fiscalPeriod ?? year ?? JSON.stringify(row));
    byPeriod.set(key, normalized);
  }

  return [...byPeriod.values()]
    .sort((a, b) => {
      const aParts = dateParts(a);
      const bParts = dateParts(b);
      const aOrder = (aParts.year ?? 0) * 100 + (aParts.month ?? 0);
      const bOrder = (bParts.year ?? 0) * 100 + (bParts.month ?? 0);
      return aOrder - bOrder;
    })
    .slice(-3);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await loadAllSupabaseRows<AnalysisRow>("履歴取得失敗", (from, to) =>
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, history")
      .order("ticker", { ascending: true })
      .range(from, to)
  );

  let targets = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const current = Array.isArray(row.history) ? row.history : [];
    if (current.length === 0) continue;

    const normalized = normalizeHistory(current);
    if (JSON.stringify(current) === JSON.stringify(normalized)) continue;

    targets += 1;

    if (!apply) {
      console.log(`[READY] ${row.ticker} ${current.length}期 -> ${normalized.length}期`);
      continue;
    }

    const { error } = await supabaseAdmin
      .from("company_analyses")
      .update({ history: normalized })
      .eq("ticker", row.ticker);

    if (error) {
      failed += 1;
      console.log(`[FAILED] ${row.ticker}: ${error.message}`);
      continue;
    }

    updated += 1;
    console.log(`[UPDATED] ${row.ticker} ${normalized.length}期`);
  }

  console.log("===== 既存の推移・比較への履歴反映 =====");
  console.log({ apply, analyses: rows.length, targets, updated, failed });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
