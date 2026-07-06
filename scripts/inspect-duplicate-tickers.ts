import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

type Row = Record<string, any>;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function size(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length;
  return value == null ? 0 : 1;
}

function dataScore(row: Row) {
  return [
    typeof row.score === "number" ? 10 : 0,
    typeof row.danger_score === "number" ? 5 : 0,
    size(row.financials) * 2,
    size(row.history) * 10,
    size(row.risk) * 2,
    row.doc_id ? 5 : 0,
    row.updated_at ? 2 : 0,
  ].reduce((a, b) => a + b, 0);
}

function summarize(row: Row, index: number) {
  return {
    index,
    id: row.id ?? null,
    ticker: row.ticker,
    company_name: row.company_name,
    score: row.score ?? null,
    danger_score: row.danger_score ?? null,
    risk_level: row.risk_level ?? null,
    doc_id: row.doc_id ?? null,
    history_count: size(row.history),
    financials_keys: size(row.financials),
    risk_keys: size(row.risk),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    dataScore: dataScore(row),
  };
}

function pickKeep(rows: Row[]) {
  return [...rows]
    .map((row, index) => ({ row, index, score: dataScore(row) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.row.updated_at ?? "").localeCompare(String(a.row.updated_at ?? ""));
    })[0];
}

async function main() {
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const targets = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const tickers = targets.length > 0 ? targets : ["5834", "7140"];

  for (const ticker of tickers) {
    const { data, error } = await supabase
      .from("company_analyses")
      .select("*")
      .eq("ticker", ticker)
      .order("updated_at", { ascending: false, nullsFirst: false });

    if (error) throw error;

    const rows = data ?? [];
    console.log(`\n=== ${ticker} duplicate inspection ===`);
    console.log({ count: rows.length });

    rows.forEach((row, index) => {
      console.log(summarize(row, index));
    });

    if (rows.length > 1) {
      const keep = pickKeep(rows);
      console.log("keep_candidate", summarize(keep.row, keep.index));
      console.log("delete_candidates", rows
        .map((row, index) => ({ row, index }))
        .filter((item) => item.index !== keep.index)
        .map((item) => summarize(item.row, item.index))
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
