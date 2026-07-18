import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  loadAllListedCompanies,
  mergeNewsResults,
  processCompanyNews,
} from "@/lib/news-ingestion";

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
  worker: (item: T) => Promise<any>
) {
  const results: any[] = [];

  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    results.push(...(await Promise.all(chunk.map(worker))));
  }

  return results;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const companies = await loadAllListedCompanies();
    const batchSize = Math.max(1, Number(process.env.NEWS_CRON_BATCH_SIZE || 40));
    const concurrency = Math.max(1, Number(process.env.NEWS_CRON_CONCURRENCY || 8));
    const perCompany = Math.max(1, Number(process.env.NEWS_PER_COMPANY || 1));
    const offset = await getNextOffset(companies.length);
    const targets = companies.slice(offset, offset + batchSize);

    const results = await processWithConcurrency(
      targets,
      concurrency,
      (company) => processCompanyNews(company, perCompany)
    );
    const totals = mergeNewsResults(results);

    const nextOffset = offset + targets.length >= companies.length ? 0 : offset + targets.length;
    await saveNextOffset(nextOffset);

    return NextResponse.json({
      ok: true,
      type: "fetch-news-all-markets",
      totalCompanies: companies.length,
      offset,
      nextOffset,
      processed: targets.length,
      ...totals,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "ニュース取得に失敗しました",
      },
      { status: 500 }
    );
  }
}
