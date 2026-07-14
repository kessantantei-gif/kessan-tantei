import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

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
  score: number | null;
  danger_score: number | null;
  financials: JsonObject | null;
  history: HistoryRow[] | null;
};

type Issue = {
  severity: "ERROR" | "WARNING";
  ticker: string;
  companyName: string;
  field: string;
  message: string;
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
  "cash",
  "cashAndDeposits",
  "currentAssets",
  "currentLiabilities",
  "assets",
  "netAssets",
  "equityAmount",
] as const;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ratio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function approximatelyEqual(a: number, b: number, tolerance = 0.02) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale <= tolerance;
}

function periodKey(row: HistoryRow) {
  return row.periodEnd ?? String(row.fiscalYear ?? row.year ?? "");
}

function exactUnitMismatch(a: number, b: number) {
  if (a === 0 || b === 0 || Math.sign(a) !== Math.sign(b)) return false;
  const ratioValue = Math.max(Math.abs(a), Math.abs(b)) / Math.min(Math.abs(a), Math.abs(b));
  if (ratioValue < 500 || ratioValue > 2_000) return false;
  const smaller = Math.min(Math.abs(a), Math.abs(b));
  const larger = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(smaller * 1_000 - larger) / Math.max(larger, 1) <= 0.05;
}

function auditCompany(company: CompanyRow) {
  const issues: Issue[] = [];
  const name = company.company_name ?? company.ticker;
  const financials = company.financials ?? {};
  const history = Array.isArray(company.history) ? [...company.history].sort((a, b) => periodKey(a).localeCompare(periodKey(b))) : [];

  const add = (severity: Issue["severity"], field: string, message: string) => {
    issues.push({ severity, ticker: company.ticker, companyName: name, field, message });
  };

  for (const field of AMOUNT_FIELDS) {
    const value = financials[field];
    if (typeof value === "number" && !Number.isFinite(value)) {
      add("ERROR", field, "非有限数が保存されています");
    }
  }

  const revenue = finite(financials.revenue);
  const grossProfit = finite(financials.grossProfit);
  const operatingIncome = finite(financials.operatingIncome);
  const netIncome = finite(financials.netIncome);
  const operatingCF = finite(financials.operatingCF);
  const cash = finite(financials.cash ?? financials.cashAndDeposits);
  const currentLiabilities = finite(financials.currentLiabilities);
  const assets = finite(financials.assets);
  const netAssets = finite(financials.netAssets ?? financials.equityAmount);

  if (revenue !== null && revenue < 0) add("ERROR", "revenue", "売上高がマイナスです");
  if (assets !== null && assets <= 0) add("ERROR", "assets", "総資産が0以下です");
  if (currentLiabilities !== null && currentLiabilities < 0) {
    add("ERROR", "currentLiabilities", "流動負債がマイナスです");
  }
  if (assets !== null && cash !== null && cash > assets * 1.05) {
    add("ERROR", "cash", "現金が総資産を上回っています");
  }
  if (assets !== null && netAssets !== null && netAssets > assets * 1.05) {
    add("ERROR", "netAssets", "純資産が総資産を上回っています");
  }
  if (revenue !== null && grossProfit !== null && grossProfit > revenue * 1.02) {
    add("ERROR", "grossProfit", "売上総利益が売上高を上回っています");
  }

  const ratioChecks: Array<[string, number | null]> = [
    ["operatingMargin", ratio(operatingIncome, revenue)],
    ["grossMargin", ratio(grossProfit, revenue)],
    ["netMargin", ratio(netIncome, revenue)],
    ["operatingCFMargin", ratio(operatingCF, revenue)],
    ["ocfMargin", ratio(operatingCF, revenue)],
    ["equityRatio", ratio(netAssets, assets)],
    ["cashRatio", ratio(cash, currentLiabilities)],
  ];

  for (const [field, expected] of ratioChecks) {
    const stored = finite(financials[field]);
    if (stored !== null && expected !== null && !approximatelyEqual(stored, expected)) {
      add("ERROR", field, `保存比率と元数値からの再計算値が不一致です（再計算: ${expected.toFixed(2)}）`);
    }
  }

  if (company.score !== null && (!Number.isFinite(company.score) || company.score < 0 || company.score > 100)) {
    add("ERROR", "score", "総合スコアが0〜100の範囲外です");
  }
  if (
    company.danger_score !== null &&
    (!Number.isFinite(company.danger_score) || company.danger_score < 0 || company.danger_score > 100)
  ) {
    add("ERROR", "danger_score", "Danger Scoreが0〜100の範囲外です");
  }

  const keys = history.map(periodKey).filter(Boolean);
  if (new Set(keys).size !== keys.length) {
    add("ERROR", "history", "決算期が重複しています");
  }

  for (let index = 1; index < history.length; index += 1) {
    for (const field of ["revenue", "grossProfit", "operatingIncome", "netIncome", "operatingCF"] as const) {
      const previous = finite(history[index - 1][field]);
      const current = finite(history[index][field]);
      if (previous !== null && current !== null && exactUnitMismatch(previous, current)) {
        add("ERROR", `history.${field}`, `${periodKey(history[index - 1])}→${periodKey(history[index])}で1,000倍単位差の可能性があります`);
      }
    }
  }

  if (revenue === null) add("WARNING", "revenue", "売上高を取得できていません");
  if (assets === null) add("WARNING", "assets", "総資産を取得できていません");
  if (history.length < 2) add("WARNING", "history", "比較可能な決算履歴が不足しています");

  return issues;
}

async function main() {
  const { data, error } = await supabase
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, history")
    .order("ticker", { ascending: true });

  if (error) throw error;

  const companies = (data ?? []) as CompanyRow[];
  const issues = companies.flatMap(auditCompany);
  const errors = issues.filter((issue) => issue.severity === "ERROR");
  const warnings = issues.filter((issue) => issue.severity === "WARNING");

  console.log("=== financial integrity audit ===");
  console.log({ companies: companies.length, errors: errors.length, warnings: warnings.length });
  for (const issue of issues) {
    console.log(`[${issue.severity}] ${issue.ticker} ${issue.companyName} / ${issue.field}: ${issue.message}`);
  }

  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
