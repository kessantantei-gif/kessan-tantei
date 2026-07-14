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

const financialIndustries = new Set([
  "銀行業",
  "証券、商品先物取引業",
  "保険業",
  "その他金融業",
]);

type CompanyRow = {
  id: string;
  ticker: string;
  industry_name: string | null;
  security_type: string;
  is_financial: boolean;
  is_reit: boolean;
  is_foreign: boolean;
  source_payload: Record<string, unknown> | null;
};

async function loadCompanies() {
  const rows: CompanyRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("all_market_companies")
      .select(
        "id, ticker, industry_name, security_type, is_financial, is_reit, is_foreign, source_payload"
      )
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`会社マスタ取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as CompanyRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function main() {
  const companies = await loadCompanies();
  let financialCount = 0;
  let reitCount = 0;
  let foreignCount = 0;
  let changedCount = 0;

  for (const company of companies) {
    const payloadText = JSON.stringify(company.source_payload ?? {});
    const isFinancial = financialIndustries.has(company.industry_name ?? "");
    const isReit =
      company.security_type === "reit" ||
      /REIT|不動産投資法人|投資法人/i.test(payloadText);
    const isForeign =
      company.is_foreign || /外国株|外国会社|Foreign Stock/i.test(payloadText);

    if (isFinancial) financialCount += 1;
    if (isReit) reitCount += 1;
    if (isForeign) foreignCount += 1;

    const dataQuality = isFinancial || isReit ? "warning" : "unreviewed";
    if (
      company.is_financial !== isFinancial ||
      company.is_reit !== isReit ||
      company.is_foreign !== isForeign
    ) {
      const { error } = await supabase
        .from("all_market_companies")
        .update({
          is_financial: isFinancial,
          is_reit: isReit,
          is_foreign: isForeign,
          data_quality: dataQuality,
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id);
      if (error) throw new Error(`分類更新失敗 ${company.ticker}: ${error.message}`);
      changedCount += 1;
    }
  }

  console.log("=== 全市場特殊区分分類完了 ===");
  console.log(`対象: ${companies.length}`);
  console.log(`金融: ${financialCount}`);
  console.log(`REIT: ${reitCount}`);
  console.log(`外国会社: ${foreignCount}`);
  console.log(`更新: ${changedCount}`);
}

main().catch((error) => {
  console.error("全市場特殊区分分類に失敗しました。", error);
  process.exit(1);
});
