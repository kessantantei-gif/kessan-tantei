import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp").replace(/\/$/, "");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const publicPaths = [
  "/",
  "/markets",
  "/growth",
  "/standard",
  "/standard/ranking",
  "/prime",
  "/prime/ranking",
  "/ranking",
  "/pricing",
  "/features",
  "/themes",
  "/updates",
  "/robots.txt",
  "/sitemap.xml",
];

type CompanyRow = {
  ticker: string;
  market_segment: "growth" | "standard" | "prime";
  listing_status: string;
};

type AnalysisRow = {
  ticker: string;
  market_segment: string | null;
  score: number | null;
  danger_score: number | null;
  risk_level: string | null;
};

async function loadAll<T>(
  table: string,
  select: string,
  configure?: (query: any) => any
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (configure) query = configure(query);

    const { data, error } = await query;
    if (error) throw new Error(`${table}取得失敗: ${error.message}`);

    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function checkUrl(path: string) {
  const response = await fetch(`${appUrl}${path}`, {
    redirect: "manual",
    headers: { "user-agent": "kessan-tantei-phase16-audit/1.0" },
  });
  const acceptable = [200, 301, 302, 307, 308].includes(response.status);
  return { path, status: response.status, acceptable };
}

async function main() {
  const failures: string[] = [];

  const [companyRows, analysisRows] = await Promise.all([
    loadAll<CompanyRow>(
      "all_market_companies",
      "ticker, market_segment, listing_status",
      (query) =>
        query
          .eq("listing_status", "listed")
          .in("market_segment", ["growth", "standard", "prime"])
    ),
    loadAll<AnalysisRow>(
      "company_analyses",
      "ticker, market_segment, score, danger_score, risk_level",
      (query) => query.neq("risk_level", "EXCLUDED")
    ),
  ]);

  const analyzedTickers = new Set(analysisRows.map((row) => row.ticker));

  console.log("\n=== Phase 16 全市場受入監査 ===");
  for (const market of ["growth", "standard", "prime"] as const) {
    const listed = companyRows.filter((row) => row.market_segment === market);
    const analyzed = listed.filter((row) => analyzedTickers.has(row.ticker));
    const coverage = listed.length > 0 ? analyzed.length / listed.length : 0;
    console.log(
      `${market}: listed=${listed.length}, analyzed=${analyzed.length}, coverage=${(
        coverage * 100
      ).toFixed(1)}%`
    );

    if (listed.length === 0) failures.push(`${market}: 上場対象が0件`);
    if (coverage < 0.9) failures.push(`${market}: 解析率が90%未満`);
  }

  const tickerCounts = new Map<string, number>();
  for (const row of analysisRows) {
    tickerCounts.set(row.ticker, (tickerCounts.get(row.ticker) ?? 0) + 1);
  }
  const duplicates = [...tickerCounts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) failures.push(`company_analyses重複ticker: ${duplicates.length}件`);

  const invalidScores = analysisRows.filter(
    (row) =>
      typeof row.score !== "number" ||
      row.score < 0 ||
      row.score > 100 ||
      typeof row.danger_score !== "number" ||
      row.danger_score < 0 ||
      row.danger_score > 100
  );
  if (invalidScores.length > 0) failures.push(`スコア範囲外: ${invalidScores.length}件`);

  const httpResults = await Promise.all(publicPaths.map(checkUrl));
  for (const result of httpResults) {
    console.log(`HTTP ${result.status}: ${result.path}`);
    if (!result.acceptable) failures.push(`HTTP ${result.status}: ${result.path}`);
  }

  if (failures.length > 0) {
    console.error("\nPhase 16 全市場受入監査: FAILED");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("\nPhase 16 全市場受入監査: PASSED");
}

main().catch((error) => {
  console.error("Phase 16監査で例外が発生しました。", error);
  process.exit(1);
});
