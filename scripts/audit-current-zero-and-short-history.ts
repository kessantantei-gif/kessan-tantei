import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Json = Record<string, unknown>;

type Company = {
  ticker: string;
  company_name: string;
  listing_status: string;
};

type Analysis = {
  ticker: string;
  financials: Json | null;
  history: Json[] | null;
};

const FIELDS = [
  "revenue",
  "operatingIncome",
  "ordinaryIncome",
  "ordinaryProfit",
  "netIncome",
  "operatingCF",
  "investingCF",
  "financingCF",
  "cash",
  "currentAssets",
  "currentLiabilities",
  "assets",
  "liabilities",
  "netAssets",
  "loans",
  "deposits",
  "securities",
  "insuranceRevenue",
  "policyReserves",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function zeroFields(row: Json | null | undefined) {
  if (!row) return [] as string[];
  return FIELDS.filter((field) => field in row && isFiniteNumber(row[field]) && row[field] === 0);
}

function periodKey(row: Json | null | undefined) {
  if (!row) return "";
  return String(row.periodEnd ?? row.fiscalYear ?? row.year ?? "");
}

async function main() {
  const [companies, analyses] = await Promise.all([
    loadAllSupabaseRows<Company>("会社取得失敗", (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("ticker, company_name, listing_status")
        .eq("listing_status", "listed")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
    loadAllSupabaseRows<Analysis>("分析取得失敗", (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, financials, history")
        .order("ticker", { ascending: true })
        .range(from, to)
    ),
  ]);

  const companyByTicker = new Map(companies.map((row) => [row.ticker, row]));
  const rows = analyses.flatMap((analysis) => {
    const company = companyByTicker.get(analysis.ticker);
    if (!company) return [];

    const history = Array.isArray(analysis.history) ? analysis.history : [];
    const zeros = [
      ...new Set([
        ...zeroFields(analysis.financials),
        ...history.flatMap((row) => zeroFields(row)),
      ]),
    ].sort();
    const historyCount = new Set(history.map(periodKey).filter(Boolean)).size;

    if (zeros.length === 0 && historyCount >= 3) return [];

    return [{
      ticker: analysis.ticker,
      companyName: company.company_name,
      zeroFields: zeros,
      historyCount,
      reasons: [
        ...(zeros.length > 0 ? ["zero"] : []),
        ...(historyCount < 3 ? ["history_under_3"] : []),
      ],
    }];
  });

  const zeroRows = rows.filter((row) => row.zeroFields.length > 0);
  const shortRows = rows.filter((row) => row.historyCount < 3);
  const bothRows = rows.filter((row) => row.zeroFields.length > 0 && row.historyCount < 3);

  const report = {
    generatedAt: new Date().toISOString(),
    listedCompanies: companies.length,
    analyses: analyses.length,
    remainingTargets: rows.length,
    zeroCompanies: zeroRows.length,
    historyUnder3Companies: shortRows.length,
    both: bothRows.length,
    zeroFieldBreakdown: Object.fromEntries(
      FIELDS.map((field) => [field, zeroRows.filter((row) => row.zeroFields.includes(field)).length])
        .filter(([, count]) => count > 0)
    ),
    rows,
  };

  const outputPath = path.join(
    process.cwd(),
    "logs",
    `audit-current-zero-short-history-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log("===== 現在DB 0・3期未満監査（読取専用） =====");
  console.log({
    listedCompanies: report.listedCompanies,
    analyses: report.analyses,
    remainingTargets: report.remainingTargets,
    zeroCompanies: report.zeroCompanies,
    historyUnder3Companies: report.historyUnder3Companies,
    both: report.both,
    zeroFieldBreakdown: report.zeroFieldBreakdown,
    outputPath,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
