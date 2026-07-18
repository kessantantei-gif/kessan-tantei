import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase環境変数が必要です。");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Company = {
  id: string;
  ticker: string;
  market_segment: string | null;
  listing_status: string | null;
};
type Legacy = { ticker: string };
type RefRow = { company_id: string };

async function count(table: string) {
  const result = await supabase.from(table).select("*", { count: "exact", head: true });
  if (result.error) throw new Error(`${table}件数取得失敗: ${result.error.message}`);
  return result.count ?? 0;
}

async function pages<T>(table: string, columns: string, currentOnly = false) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(columns).range(from, from + 999);
    if (currentOnly) query = query.eq("is_current", true);
    const result = await query;
    if (result.error) throw new Error(`${table}取得失敗: ${result.error.message}`);
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function main() {
  const [legacyCount, companyCount, periodCount, scoreCount, riskCount] = await Promise.all([
    count("company_analyses"),
    count("all_market_companies"),
    count("company_financial_periods"),
    count("company_score_snapshots"),
    count("company_risk_snapshots"),
  ]);

  const [companies, legacy, memberships, scores, risks] = await Promise.all([
    pages<Company>("all_market_companies", "id,ticker,market_segment,listing_status"),
    pages<Legacy>("company_analyses", "ticker"),
    pages<RefRow>("market_memberships", "company_id", true),
    pages<RefRow>("company_score_snapshots", "company_id", true),
    pages<RefRow>("company_risk_snapshots", "company_id", true),
  ]);

  const byTicker = new Map(companies.map((row) => [row.ticker, row]));
  const companyIds = new Set(companies.map((row) => row.id));
  const membershipIds = new Set(memberships.map((row) => row.company_id));
  const scoreIds = new Set(scores.map((row) => row.company_id));
  const riskIds = new Set(risks.map((row) => row.company_id));

  const listed = companies.filter(
    (row) => row.listing_status === "listed" && ["growth", "standard", "prime"].includes(row.market_segment ?? "")
  );
  const analyzed = legacy.map((row) => byTicker.get(row.ticker)).filter((row): row is Company => Boolean(row));
  const missingMaster = legacy.filter((row) => !byTicker.has(row.ticker));
  const missingMembership = listed.filter((row) => !membershipIds.has(row.id));
  const orphanMembership = memberships.filter((row) => !companyIds.has(row.company_id));
  const missingScore = analyzed.filter((row) => !scoreIds.has(row.id));
  const missingRisk = analyzed.filter((row) => !riskIds.has(row.id));

  const tickerCounts = new Map<string, number>();
  for (const row of companies) tickerCounts.set(row.ticker, (tickerCounts.get(row.ticker) ?? 0) + 1);
  const duplicates = [...tickerCounts].filter(([, n]) => n > 1).map(([ticker]) => ticker);
  const invalidMarkets = companies.filter(
    (row) => !row.market_segment || !["growth", "standard", "prime", "other"].includes(row.market_segment)
  );
  const markets = listed.reduce<Record<string, number>>((result, row) => {
    const market = row.market_segment ?? "missing";
    result[market] = (result[market] ?? 0) + 1;
    return result;
  }, {});

  console.log("\n=== Phase 1 全市場DB監査 ===");
  console.log(`company_analyses:             ${legacyCount}`);
  console.log(`all_market_companies:         ${companyCount}`);
  console.log(`上場対象会社:                 ${listed.length}`);
  console.log(`解析済み会社:                 ${analyzed.length}`);
  console.log(`company_financial_periods:    ${periodCount}`);
  console.log(`company_score_snapshots:      ${scoreCount}`);
  console.log(`company_risk_snapshots:       ${riskCount}`);
  console.log(`市場別件数:                   ${JSON.stringify(markets)}`);
  console.log(`重複ticker:                   ${duplicates.length}`);
  console.log(`不正な市場区分:               ${invalidMarkets.length}`);
  console.log(`解析済み会社のマスタ欠損:     ${missingMaster.length}`);
  console.log(`現在市場履歴なし:             ${missingMembership.length}`);
  console.log(`孤立市場履歴:                 ${orphanMembership.length}`);
  console.log(`解析済み・現在スコアなし:     ${missingScore.length}`);
  console.log(`解析済み・現在リスクなし:     ${missingRisk.length}`);

  const failures: string[] = [];
  if (duplicates.length) failures.push(`重複ticker: ${duplicates.slice(0, 20).join(", ")}`);
  if (invalidMarkets.length) failures.push(`不正な市場区分が${invalidMarkets.length}件あります`);
  if (missingMaster.length) failures.push(`解析済み会社のマスタ欠損: ${missingMaster.slice(0, 20).map((row) => row.ticker).join(", ")}`);
  if (missingMembership.length) failures.push(`現在市場履歴なし: ${missingMembership.slice(0, 20).map((row) => row.ticker).join(", ")}`);
  if (orphanMembership.length) failures.push(`孤立市場履歴が${orphanMembership.length}件あります`);
  if (missingScore.length) failures.push(`解析済み・現在スコアなし: ${missingScore.slice(0, 20).map((row) => row.ticker).join(", ")}`);
  if (missingRisk.length) failures.push(`解析済み・現在リスクなし: ${missingRisk.slice(0, 20).map((row) => row.ticker).join(", ")}`);

  if (failures.length) {
    console.error("\nPhase 1監査: FAILED");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log("\nPhase 1監査: PASSED");
}

main().catch((error) => {
  console.error("Phase 1監査で例外が発生しました。", error);
  process.exit(1);
});
