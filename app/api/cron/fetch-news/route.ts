import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "@/lib/supabase";
import { isBlockedNews } from "@/lib/news-filter";

type GrowthCompany = {
  ticker: string;
  name: string;
};

type RssItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  source?: { "#text"?: string } | string;
};

type ProcessResult = {
  inserted: number;
  skipped: number;
  blocked: number;
  failed: number;
};

const parser = new XMLParser();
const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

function normalizeItems(items: RssItem | RssItem[] | undefined): RssItem[] {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function sourceText(source: RssItem["source"]) {
  if (!source) return "Google News";
  if (typeof source === "string") return source;
  return source["#text"] || "Google News";
}

function summarize(title: string) {
  return title.length > 90 ? `${title.slice(0, 90)}...` : title;
}

async function fetchRSS(keyword: string) {
  const query = `${keyword} 決算 OR 開示 OR IR OR 業績 OR 提携 OR 新サービス OR 上方修正 -掲示板 -株価予想 -口コミ`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "kessan-tantei-news-bot" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`RSS fetch failed: ${keyword}`);
    const xml = await res.text();
    const json = parser.parse(xml);
    return normalizeItems(json.rss?.channel?.item);
  } finally {
    clearTimeout(timer);
  }
}

async function getNextOffset(total: number) {
  const { data } = await supabaseAdmin
    .from("cron_state")
    .select("value")
    .eq("key", "fetch_news_offset")
    .maybeSingle();

  const current = Number(data?.value ?? 0);
  if (!Number.isFinite(current) || current >= total) return 0;
  return current;
}

async function saveNextOffset(nextOffset: number) {
  await supabaseAdmin.from("cron_state").upsert({
    key: "fetch_news_offset",
    value: String(nextOffset),
    updated_at: new Date().toISOString(),
  });
}

async function processCompany(company: GrowthCompany, perCompany: number): Promise<ProcessResult> {
  const result: ProcessResult = { inserted: 0, skipped: 0, blocked: 0, failed: 0 };

  try {
    const items = await fetchRSS(company.name);
    let insertedForCompany = 0;

    for (const item of items.slice(0, perCompany * 8)) {
      if (!item.title || !item.link) continue;

      const newsItem = {
        ticker: company.ticker,
        title: item.title,
        summary: summarize(item.title),
        url: item.link,
        source: sourceText(item.source),
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      };

      if (isBlockedNews(newsItem)) {
        result.blocked += 1;
        continue;
      }

      const { data: exists, error: existsError } = await supabaseAdmin
        .from("growth_news")
        .select("id")
        .eq("url", newsItem.url)
        .limit(1);

      if (existsError) {
        result.failed += 1;
        continue;
      }

      if ((exists ?? []).length > 0) {
        result.skipped += 1;
        continue;
      }

      const { error } = await supabaseAdmin.from("growth_news").insert(newsItem);
      if (error) {
        result.failed += 1;
      } else {
        result.inserted += 1;
        insertedForCompany += 1;
      }

      if (insertedForCompany >= perCompany) break;
    }
  } catch {
    result.failed += 1;
  }

  return result;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!fs.existsSync(masterPath)) {
    return NextResponse.json({ error: "data/growth-companies.json が見つかりません" }, { status: 500 });
  }

  const companies = JSON.parse(fs.readFileSync(masterPath, "utf8")) as GrowthCompany[];
  const batchSize = Math.max(1, Number(process.env.NEWS_CRON_BATCH_SIZE || 20));
  const perCompany = Math.max(1, Number(process.env.NEWS_PER_COMPANY || 1));
  const offset = await getNextOffset(companies.length);
  const targets = companies.slice(offset, offset + batchSize);

  const results = await Promise.all(targets.map((company) => processCompany(company, perCompany)));
  const totals = results.reduce(
    (acc, item) => ({
      inserted: acc.inserted + item.inserted,
      skipped: acc.skipped + item.skipped,
      blocked: acc.blocked + item.blocked,
      failed: acc.failed + item.failed,
    }),
    { inserted: 0, skipped: 0, blocked: 0, failed: 0 }
  );

  const nextOffset = offset + batchSize >= companies.length ? 0 : offset + batchSize;
  await saveNextOffset(nextOffset);

  return NextResponse.json({
    ok: true,
    type: "fetch-news",
    totalCompanies: companies.length,
    offset,
    nextOffset,
    processed: targets.length,
    ...totals,
  });
}
