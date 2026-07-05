import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

type HistoryRow = {
  year?: number | string;
  fiscalYear?: number | string;
  fiscalMonth?: number | string;
  fiscalPeriod?: string;
  fiscal_period?: string;
  period?: string;
  periodEnd?: string;
  revenue?: number;
  grossProfit?: number;
  netIncome?: number;
  operatingIncome?: number;
  operatingCF?: number;
  [key: string]: any;
};

type CompanyAnalysis = {
  ticker: string;
  company_name: string;
  doc_id: string | null;
  history: HistoryRow[] | null;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function isForeignOrJdr(company: CompanyAnalysis) {
  return (
    company.company_name.includes("ＪＤＲ") ||
    company.company_name.includes("リミテッド") ||
    company.company_name.toLowerCase().includes("limited")
  );
}

function rowYear(row: HistoryRow) {
  const value = Number(row.fiscalYear ?? row.year);
  return Number.isFinite(value) ? value : null;
}

function rowMonth(row: HistoryRow) {
  const value = Number(row.fiscalMonth);
  return Number.isFinite(value) ? value : null;
}

function periodText(row: HistoryRow) {
  return row.fiscalPeriod ?? row.fiscal_period ?? row.period ?? "";
}

function hasValue(value: any) {
  return typeof value === "number" && Number.isFinite(value);
}

function metricCount(row: HistoryRow) {
  return [row.revenue, row.grossProfit, row.netIncome, row.operatingIncome, row.operatingCF].filter(hasValue).length;
}

function bestKnownMonth(history: HistoryRow[]) {
  const months = history.map(rowMonth).filter((value): value is number => value !== null);
  if (months.length === 0) return null;

  const counts = new Map<number, number>();
  for (const month of months) counts.set(month, (counts.get(month) ?? 0) + 1);

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function mergeRows(rows: HistoryRow[], fiscalMonth: number | null) {
  const sorted = [...rows].sort((a, b) => {
    const aScore = (periodText(a) ? 10 : 0) + (rowMonth(a) ? 10 : 0) + metricCount(a);
    const bScore = (periodText(b) ? 10 : 0) + (rowMonth(b) ? 10 : 0) + metricCount(b);
    return aScore - bScore;
  });

  const merged = Object.assign({}, ...sorted) as HistoryRow;
  const year = rowYear(merged);
  const month = rowMonth(merged) ?? fiscalMonth;

  if (year !== null) {
    merged.year = year;
    merged.fiscalYear = year;
  }

  if (month !== null) {
    merged.fiscalMonth = month;
    if (!periodText(merged) && year !== null) {
      merged.fiscalPeriod = `${year}年${month}月期`;
    }
  }

  delete merged.fiscal_period;
  delete merged.period;

  return merged;
}

function normalizeHistory(company: CompanyAnalysis) {
  const history = Array.isArray(company.history) ? company.history : [];
  if (history.length === 0 || isForeignOrJdr(company)) return null;

  const fiscalMonth = bestKnownMonth(history);
  const byYear = new Map<number, HistoryRow[]>();

  for (const row of history) {
    const year = rowYear(row);
    if (year === null) continue;
    const items = byYear.get(year) ?? [];
    items.push(row);
    byYear.set(year, items);
  }

  const normalized = [...byYear.entries()]
    .map(([, rows]) => mergeRows(rows, fiscalMonth))
    .filter((row) => rowYear(row) !== null)
    .sort((a, b) => Number(rowYear(a)) - Number(rowYear(b)))
    .slice(-3);

  if (normalized.length === 0) return null;

  return normalized;
}

function changed(before: HistoryRow[] | null, after: HistoryRow[] | null) {
  return JSON.stringify(before ?? []) !== JSON.stringify(after ?? []);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase
    .from("company_analyses")
    .select("ticker, company_name, doc_id, history")
    .order("ticker", { ascending: true });

  if (error) throw error;

  const companies = (data ?? []) as CompanyAnalysis[];
  let candidates = 0;
  let updated = 0;
  let skipped = 0;

  for (const company of companies) {
    const nextHistory = normalizeHistory(company);

    if (!nextHistory || !changed(company.history, nextHistory)) {
      skipped += 1;
      continue;
    }

    candidates += 1;
    console.log(`${apply ? "UPDATE" : "DRY"} ${company.ticker} ${company.company_name}`);
    console.log(`  before: ${(company.history ?? []).map((row) => `${rowYear(row) ?? "?"}:${periodText(row) || "-"}`).join(" / ")}`);
    console.log(`  after : ${nextHistory.map((row) => `${rowYear(row) ?? "?"}:${periodText(row) || "-"}`).join(" / ")}`);

    if (apply) {
      const { error: updateError } = await supabase
        .from("company_analyses")
        .update({
          history: nextHistory,
          updated_at: new Date().toISOString(),
        })
        .eq("ticker", company.ticker);

      if (updateError) throw updateError;
      updated += 1;
    }
  }

  console.log("\n=== normalize history periods ===");
  console.log({ apply, candidates, updated, skipped, total: companies.length });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
