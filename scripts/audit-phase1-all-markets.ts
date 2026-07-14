import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。"
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type CompanyRow = {
  id: string;
  ticker: string;
  market_segment: string | null;
  listing_status: string | null;
};

type MembershipRow = {
  company_id: string;
  market_segment: string;
  is_current: boolean;
};

type SnapshotRow = {
  company_id: string;
  is_current: boolean;
};

async function exactCount(table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`${table} の件数取得に失敗しました: ${error.message}`);
  }

  return count ?? 0;
}

async function main() {
  const [
    legacyCount,
    companyCount,
    financialPeriodCount,
    scoreSnapshotCount,
    riskSnapshotCount,
    importRunCount,
    qualityIssueCount,
  ] = await Promise.all([
    exactCount("company_analyses"),
    exactCount("all_market_companies"),
    exactCount("company_financial_periods"),
    exactCount("company_score_snapshots"),
    exactCount("company_risk_snapshots"),
    exactCount("data_import_runs"),
    exactCount("data_quality_issues"),
  ]);

  const [companyResult, membershipResult, scoreResult, riskResult] =
    await Promise.all([
      supabase
        .from("all_market_companies")
        .select("id, ticker, market_segment, listing_status")
        .limit(10000),
      supabase
        .from("market_memberships")
        .select("company_id, market_segment, is_current")
        .eq("is_current", true)
        .limit(10000),
      supabase
        .from("company_score_snapshots")
        .select("company_id, is_current")
        .eq("is_current", true)
        .limit(10000),
      supabase
        .from("company_risk_snapshots")
        .select("company_id, is_current")
        .eq("is_current", true)
        .limit(10000),
    ]);

  if (companyResult.error) {
    throw new Error(
      `all_market_companies 読み取り失敗: ${companyResult.error.message}`
    );
  }
  if (membershipResult.error) {
    throw new Error(
      `market_memberships 読み取り失敗: ${membershipResult.error.message}`
    );
  }
  if (scoreResult.error) {
    throw new Error(
      `company_score_snapshots 読み取り失敗: ${scoreResult.error.message}`
    );
  }
  if (riskResult.error) {
    throw new Error(
      `company_risk_snapshots 読み取り失敗: ${riskResult.error.message}`
    );
  }

  const companyRows = (companyResult.data ?? []) as CompanyRow[];
  const membershipRows = (membershipResult.data ?? []) as MembershipRow[];
  const scoreRows = (scoreResult.data ?? []) as SnapshotRow[];
  const riskRows = (riskResult.data ?? []) as SnapshotRow[];

  const companyIds = new Set(companyRows.map((row) => row.id));
  const currentMembershipIds = new Set(
    membershipRows.map((row) => row.company_id)
  );
  const currentScoreIds = new Set(scoreRows.map((row) => row.company_id));
  const currentRiskIds = new Set(riskRows.map((row) => row.company_id));

  const tickerCounts = new Map<string, number>();
  for (const company of companyRows) {
    tickerCounts.set(company.ticker, (tickerCounts.get(company.ticker) ?? 0) + 1);
  }

  const duplicateTickers = [...tickerCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ticker]) => ticker);

  const invalidMarkets = companyRows.filter(
    (company) =>
      !company.market_segment ||
      !["growth", "standard", "prime", "other"].includes(
        company.market_segment
      )
  );

  const missingMemberships = companyRows.filter(
    (company) => !currentMembershipIds.has(company.id)
  );
  const orphanMemberships = membershipRows.filter(
    (membership) => !companyIds.has(membership.company_id)
  );
  const missingScores = companyRows.filter(
    (company) => !currentScoreIds.has(company.id)
  );
  const missingRisks = companyRows.filter(
    (company) => !currentRiskIds.has(company.id)
  );

  const marketCounts = companyRows.reduce<Record<string, number>>(
    (result, company) => {
      const market = company.market_segment ?? "missing";
      result[market] = (result[market] ?? 0) + 1;
      return result;
    },
    {}
  );

  console.log("\n=== Phase 1 全市場DB監査 ===");
  console.log(`company_analyses:             ${legacyCount}`);
  console.log(`all_market_companies:         ${companyCount}`);
  console.log(`company_financial_periods:    ${financialPeriodCount}`);
  console.log(`company_score_snapshots:      ${scoreSnapshotCount}`);
  console.log(`company_risk_snapshots:       ${riskSnapshotCount}`);
  console.log(`data_import_runs:             ${importRunCount}`);
  console.log(`data_quality_issues:          ${qualityIssueCount}`);
  console.log(`市場別件数:                   ${JSON.stringify(marketCounts)}`);
  console.log(`重複ticker:                   ${duplicateTickers.length}`);
  console.log(`不正な市場区分:               ${invalidMarkets.length}`);
  console.log(`現在市場履歴なし:             ${missingMemberships.length}`);
  console.log(`孤立市場履歴:                 ${orphanMemberships.length}`);
  console.log(`現在スコアなし:               ${missingScores.length}`);
  console.log(`現在リスクなし:               ${missingRisks.length}`);

  const failures: string[] = [];

  if (companyCount !== legacyCount) {
    failures.push(
      `all_market_companies(${companyCount}) と company_analyses(${legacyCount}) の件数が不一致`
    );
  }
  if (duplicateTickers.length > 0) {
    failures.push(`重複ticker: ${duplicateTickers.slice(0, 20).join(", ")}`);
  }
  if (invalidMarkets.length > 0) {
    failures.push(
      `不正な市場区分: ${invalidMarkets
        .slice(0, 20)
        .map((row) => `${row.ticker}:${row.market_segment}`)
        .join(", ")}`
    );
  }
  if (missingMemberships.length > 0) {
    failures.push(
      `現在市場履歴なし: ${missingMemberships
        .slice(0, 20)
        .map((row) => row.ticker)
        .join(", ")}`
    );
  }
  if (orphanMemberships.length > 0) {
    failures.push(`孤立市場履歴が${orphanMemberships.length}件あります`);
  }
  if (missingScores.length > 0) {
    failures.push(
      `現在スコアなし: ${missingScores
        .slice(0, 20)
        .map((row) => row.ticker)
        .join(", ")}`
    );
  }
  if (missingRisks.length > 0) {
    failures.push(
      `現在リスクなし: ${missingRisks
        .slice(0, 20)
        .map((row) => row.ticker)
        .join(", ")}`
    );
  }

  if (failures.length > 0) {
    console.error("\nPhase 1監査: FAILED");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("\nPhase 1監査: PASSED");
}

main().catch((error) => {
  console.error("Phase 1監査で例外が発生しました。", error);
  process.exit(1);
});