import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";
import {
  loadAllListedCompanies,
  mergeNewsResults,
  processCompanyNews,
  type NewsProcessResult,
} from "../lib/news-ingestion";

async function getNextOffset(total: number) {
  const { data, error } = await supabaseAdmin
    .from("cron_state")
    .select("value")
    .eq("key", "fetch_news_offset")
    .maybeSingle();

  if (error) throw new Error(`ニュース進捗取得失敗: ${error.message}`);

  const current = Number(data?.value ?? 0);
  if (!Number.isFinite(current) || current < 0 || current >= total) return 0;
  return current;
}

async function saveNextOffset(nextOffset: number) {
  const { error } = await supabaseAdmin.from("cron_state").upsert({
    key: "fetch_news_offset",
    value: String(nextOffset),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`ニュース進捗保存失敗: ${error.message}`);
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<NewsProcessResult>
) {
  const results: NewsProcessResult[] = [];

  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    results.push(...(await Promise.all(chunk.map(worker))));
  }

  return results;
}

async function main() {
  const companies = await loadAllListedCompanies();
  const batchSize = Math.max(1, Number(process.env.NEWS_CRON_BATCH_SIZE || 40));
  const concurrency = Math.max(1, Number(process.env.NEWS_CRON_CONCURRENCY || 8));
  const perCompany = Math.max(1, Number(process.env.NEWS_CRON_PER_COMPANY || 3));
  const offset = await getNextOffset(companies.length);
  const targets = companies.slice(offset, offset + batchSize);

  console.log("===== All Markets Daily News Sync Start =====");
  console.log(
    JSON.stringify(
      {
        totalCompanies: companies.length,
        offset,
        batchSize,
        concurrency,
        perCompany,
        targetCount: targets.length,
      },
      null,
      2
    )
  );

  const results = await processWithConcurrency(targets, concurrency, (company) =>
    processCompanyNews(company, perCompany)
  );
  const totals = mergeNewsResults(results);

  const nextOffset =
    offset + targets.length >= companies.length ? 0 : offset + targets.length;
  await saveNextOffset(nextOffset);

  console.log("===== All Markets Daily News Sync Done =====");
  console.log(
    JSON.stringify(
      {
        totalCompanies: companies.length,
        offset,
        nextOffset,
        processed: targets.length,
        perCompany,
        ...totals,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("全市場ニュース日次同期に失敗しました。");
  console.error(error);
  process.exit(1);
});
