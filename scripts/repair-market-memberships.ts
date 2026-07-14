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
  market_segment: "growth" | "standard" | "prime" | "other";
  listing_status: string;
};

type Membership = {
  id: string;
  company_id: string;
  market_segment: string;
  effective_from: string;
};

async function loadPaged<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`${table}の取得に失敗しました: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function main() {
  const [companies, memberships] = await Promise.all([
    loadPaged<Company>(
      "all_market_companies",
      "id, ticker, market_segment, listing_status"
    ),
    loadPaged<Membership>(
      "market_memberships",
      "id, company_id, market_segment, effective_from"
    ),
  ]);

  const listed = companies.filter(
    (company) =>
      company.listing_status === "listed" &&
      ["growth", "standard", "prime"].includes(company.market_segment)
  );

  const currentResult = await supabase
    .from("market_memberships")
    .select("id, company_id, market_segment, effective_from")
    .eq("is_current", true)
    .limit(10000);

  if (currentResult.error) {
    throw new Error(`現在市場履歴の取得に失敗しました: ${currentResult.error.message}`);
  }

  const currentByCompany = new Map<string, Membership[]>();
  for (const membership of (currentResult.data ?? []) as Membership[]) {
    const rows = currentByCompany.get(membership.company_id) ?? [];
    rows.push(membership);
    currentByCompany.set(membership.company_id, rows);
  }

  const today = new Date().toISOString().slice(0, 10);
  let inserted = 0;
  let closed = 0;
  let unchanged = 0;

  for (const company of listed) {
    const currentRows = currentByCompany.get(company.id) ?? [];
    const matching = currentRows.filter(
      (membership) => membership.market_segment === company.market_segment
    );

    if (matching.length === 1 && currentRows.length === 1) {
      unchanged += 1;
      continue;
    }

    if (currentRows.length > 0) {
      const { error } = await supabase
        .from("market_memberships")
        .update({ is_current: false, effective_to: today })
        .eq("company_id", company.id)
        .eq("is_current", true);

      if (error) {
        throw new Error(`市場履歴終了失敗 ${company.ticker}: ${error.message}`);
      }
      closed += currentRows.length;
    }

    const { error } = await supabase.from("market_memberships").insert({
      company_id: company.id,
      market_segment: company.market_segment,
      effective_from: today,
      is_current: true,
      source: "jpx_market_master_repair",
      source_reference: "all_market_companies",
    });

    if (error) {
      throw new Error(`市場履歴追加失敗 ${company.ticker}: ${error.message}`);
    }
    inserted += 1;
  }

  console.log("=== 市場履歴補正完了 ===");
  console.log(`上場会社: ${listed.length}`);
  console.log(`追加: ${inserted}`);
  console.log(`終了: ${closed}`);
  console.log(`変更なし: ${unchanged}`);
}

main().catch((error) => {
  console.error("市場履歴補正に失敗しました。");
  console.error(error);
  process.exit(1);
});
