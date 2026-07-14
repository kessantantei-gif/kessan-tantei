import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Company = {
  id: string;
  ticker: string;
  company_name: string;
  market_segment: string;
  listing_status: string;
  edinet_code: string | null;
  industry_name: string | null;
  security_type: string;
  last_market_master_update: string | null;
};

async function loadAllCompanies() {
  const rows: Company[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("all_market_companies")
      .select(
        "id, ticker, company_name, market_segment, listing_status, edinet_code, industry_name, security_type, last_market_master_update"
      )
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`会社マスタ取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Company[]));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function main() {
  const companies = await loadAllCompanies();
  const listed = companies.filter((company) => company.listing_status === "listed");
  const byMarket = listed.reduce<Record<string, number>>((result, company) => {
    result[company.market_segment] = (result[company.market_segment] ?? 0) + 1;
    return result;
  }, {});

  const duplicateTickerMap = new Map<string, number>();
  for (const company of companies) {
    duplicateTickerMap.set(company.ticker, (duplicateTickerMap.get(company.ticker) ?? 0) + 1);
  }

  const duplicateTickers = [...duplicateTickerMap.entries()].filter(([, count]) => count > 1);
  const invalidTickers = listed.filter((company) => !/^\d{4}$/.test(company.ticker));
  const invalidMarkets = listed.filter(
    (company) => !["prime", "standard", "growth"].includes(company.market_segment)
  );
  const missingNames = listed.filter((company) => !company.company_name.trim());
  const missingIndustries = listed.filter((company) => !company.industry_name);
  const missingEdinet = listed.filter((company) => !company.edinet_code);
  const unsupportedSecurity = listed.filter(
    (company) => company.security_type !== "common_stock"
  );
  const notUpdated = listed.filter((company) => !company.last_market_master_update);

  const { data: currentMemberships, error: membershipError } = await supabase
    .from("market_memberships")
    .select("company_id, market_segment, is_current")
    .eq("is_current", true)
    .limit(10000);
  if (membershipError) throw new Error(`市場履歴取得失敗: ${membershipError.message}`);

  const currentMembershipByCompany = new Map(
    (currentMemberships ?? []).map((membership) => [membership.company_id, membership.market_segment])
  );
  const missingMemberships = listed.filter(
    (company) => !currentMembershipByCompany.has(company.id)
  );
  const mismatchedMemberships = listed.filter(
    (company) => currentMembershipByCompany.get(company.id) !== company.market_segment
  );

  const { data: latestRun, error: runError } = await supabase
    .from("data_import_runs")
    .select("id, status, total_count, success_count, failure_count, finished_at, metadata, error_summary")
    .eq("import_type", "jpx_market_master")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw new Error(`同期履歴取得失敗: ${runError.message}`);

  console.log("\n=== Phase 2 東証全市場マスタ監査 ===");
  console.log(`上場普通株合計:               ${listed.length}`);
  console.log(`Prime:                        ${byMarket.prime ?? 0}`);
  console.log(`Standard:                     ${byMarket.standard ?? 0}`);
  console.log(`Growth:                       ${byMarket.growth ?? 0}`);
  console.log(`EDINET紐付け:                 ${listed.length - missingEdinet.length}`);
  console.log(`EDINET未紐付け:               ${missingEdinet.length}`);
  console.log(`業種欠損:                     ${missingIndustries.length}`);
  console.log(`ticker重複:                   ${duplicateTickers.length}`);
  console.log(`ticker形式不正:               ${invalidTickers.length}`);
  console.log(`市場区分不正:                 ${invalidMarkets.length}`);
  console.log(`会社名欠損:                   ${missingNames.length}`);
  console.log(`普通株以外:                   ${unsupportedSecurity.length}`);
  console.log(`市場更新日時なし:             ${notUpdated.length}`);
  console.log(`現在市場履歴なし:             ${missingMemberships.length}`);
  console.log(`市場履歴不一致:               ${mismatchedMemberships.length}`);
  console.log(`最新同期状態:                 ${latestRun?.status ?? "なし"}`);

  const failures: string[] = [];
  if (listed.length < 3000) failures.push(`上場普通株が${listed.length}件しかありません`);
  if ((byMarket.prime ?? 0) < 1000) failures.push(`Primeが${byMarket.prime ?? 0}件しかありません`);
  if ((byMarket.standard ?? 0) < 1000) failures.push(`Standardが${byMarket.standard ?? 0}件しかありません`);
  if ((byMarket.growth ?? 0) < 300) failures.push(`Growthが${byMarket.growth ?? 0}件しかありません`);
  if (duplicateTickers.length) failures.push(`ticker重複: ${duplicateTickers.slice(0, 20).map(([ticker]) => ticker).join(", ")}`);
  if (invalidTickers.length) failures.push(`ticker形式不正: ${invalidTickers.slice(0, 20).map((row) => row.ticker).join(", ")}`);
  if (invalidMarkets.length) failures.push(`市場区分不正: ${invalidMarkets.length}件`);
  if (missingNames.length) failures.push(`会社名欠損: ${missingNames.length}件`);
  if (unsupportedSecurity.length) failures.push(`普通株以外: ${unsupportedSecurity.length}件`);
  if (notUpdated.length) failures.push(`市場更新日時なし: ${notUpdated.length}件`);
  if (missingMemberships.length) failures.push(`現在市場履歴なし: ${missingMemberships.length}件`);
  if (mismatchedMemberships.length) failures.push(`市場履歴不一致: ${mismatchedMemberships.length}件`);
  if (!latestRun || latestRun.status !== "success") {
    failures.push(`最新JPX同期が成功していません: ${latestRun?.status ?? "履歴なし"}`);
  }
  if (missingEdinet.length > Math.max(100, listed.length * 0.1)) {
    failures.push(`EDINET未紐付けが多すぎます: ${missingEdinet.length}件`);
  }
  if (missingIndustries.length > 10) {
    failures.push(`業種欠損が多すぎます: ${missingIndustries.length}件`);
  }

  if (failures.length) {
    console.error("\nPhase 2監査: FAILED");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("\nPhase 2監査: PASSED");
}

main().catch((error) => {
  console.error("Phase 2監査で例外が発生しました。");
  console.error(error);
  process.exit(1);
});
