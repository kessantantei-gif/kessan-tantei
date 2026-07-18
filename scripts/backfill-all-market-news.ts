import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";
import {
  loadAllListedCompanies,
  mergeNewsResults,
  processCompanyNews,
  type ListedCompany,
} from "../lib/news-ingestion";

const batchSize = Math.max(1, Number(process.env.NEWS_BACKFILL_BATCH_SIZE || 50));
const concurrency = Math.max(1, Number(process.env.NEWS_BACKFILL_CONCURRENCY || 8));
const perCompany = Math.max(1, Number(process.env.NEWS_PER_COMPANY || 5));
const stateKey = "backfill_all_market_news_offset";
const missingOnly = process.argv.includes("--missing-only");

async function readOffset(total: number) {
  const { data, error } = await supabaseAdmin
    .from("cron_state")
    .select("value")
    .eq("key", stateKey)
    .maybeSingle();

  if (error) throw new Error(`ニュース進捗取得失敗: ${error.message}`);
  const value = Number(data?.value ?? 0);
  return Number.isFinite(value) && value >= 0 && value < total ? value : 0;
}

async function saveOffset(offset: number) {
  const { error } = await supabaseAdmin.from("cron_state").upsert({
    key: stateKey,
    value: String(offset),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`ニュース進捗保存失敗: ${error.message}`);
}

async function loadTickersWithNews() {
  const tickers = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("growth_news")
      .select("ticker")
      .not("ticker", "is", null)
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`ニュース保存済み銘柄取得失敗: ${error.message}`);

    const page = data ?? [];
    for (const row of page) {
      if (typeof row.ticker === "string" && row.ticker) tickers.add(row.ticker);
    }

    if (page.length < pageSize) break;
  }

  return tickers;
}

async function selectTargets(companies: ListedCompany[]) {
  if (!missingOnly) return companies;

  const tickersWithNews = await loadTickersWithNews();
  return companies.filter((company) => !tickersWithNews.has(company.ticker));
}

async function processInChunks<T>(items: T[], size: number, worker: (item: T) => Promise<any>) {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.all(chunk.map(worker))));
  }
  return results;
}

async function main() {
  const allCompanies = await loadAllListedCompanies();
  const companies = await selectTargets(allCompanies);
  let offset = missingOnly || process.argv.includes("--restart") ? 0 : await readOffset(companies.length);

  if (process.argv.includes("--restart")) await saveOffset(0);

  console.log(missingOnly ? "=== ニュース未取得会社の再取得 ===" : "=== 全市場ニュース複数件取得 ===");
  console.log(`全上場会社: ${allCompanies.length}`);
  console.log(`今回の対象会社: ${companies.length}`);
  console.log(`1社あたり最大取得件数: ${perCompany}`);
  console.log(`開始位置: ${offset}`);
  console.log(`1回の処理件数: ${batchSize}`);
  console.log(`同時処理数: ${concurrency}`);

  if (companies.length === 0) {
    console.log("ニュース未取得会社はありません。");
    return;
  }

  const grandTotal = { inserted: 0, skipped: 0, blocked: 0, failed: 0 };

  while (offset < companies.length) {
    const targets = companies.slice(offset, offset + batchSize);
    const results = await processInChunks(
      targets,
      concurrency,
      (company) => processCompanyNews(company, perCompany)
    );
    const totals = mergeNewsResults(results);

    grandTotal.inserted += totals.inserted;
    grandTotal.skipped += totals.skipped;
    grandTotal.blocked += totals.blocked;
    grandTotal.failed += totals.failed;

    offset += targets.length;
    if (!missingOnly) await saveOffset(offset >= companies.length ? 0 : offset);

    console.log(
      `[${offset}/${companies.length}] 追加:${totals.inserted} 重複:${totals.skipped} 除外:${totals.blocked} 失敗:${totals.failed}`
    );
  }

  console.log(missingOnly ? "=== ニュース未取得会社の再取得完了 ===" : "=== 全市場ニュース複数件取得完了 ===");
  console.log(`追加: ${grandTotal.inserted}`);
  console.log(`重複: ${grandTotal.skipped}`);
  console.log(`除外: ${grandTotal.blocked}`);
  console.log(`失敗: ${grandTotal.failed}`);
}

main().catch((error) => {
  console.error("全市場ニュース取得に失敗しました。", error);
  process.exit(1);
});