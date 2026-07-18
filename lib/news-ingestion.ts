import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "@/lib/supabase";
import { isBlockedNews } from "@/lib/news-filter";

export type ListedCompany = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
};

type RssItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  source?: { "#text"?: string } | string;
};

export type NewsProcessResult = {
  inserted: number;
  skipped: number;
  blocked: number;
  failed: number;
};

const parser = new XMLParser();

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
  return title.length > 120 ? `${title.slice(0, 120)}...` : title;
}

async function fetchRSS(company: ListedCompany) {
  const keyword = `"${company.company_name}" ${company.ticker}`;
  const query = `${keyword} 決算 OR 開示 OR IR OR 業績 OR 提携 OR 新サービス OR 上方修正 -掲示板 -株価予想 -口コミ`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "kessan-tantei-news-bot/2.0" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`RSS ${response.status}: ${company.ticker}`);
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);
    return normalizeItems(parsed.rss?.channel?.item);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadAllListedCompanies(): Promise<ListedCompany[]> {
  const rows: ListedCompany[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, market_segment")
      .eq("listing_status", "listed")
      .in("market_segment", ["growth", "standard", "prime"])
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`上場会社取得失敗: ${error.message}`);

    const page = (data ?? []) as ListedCompany[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function processCompanyNews(
  company: ListedCompany,
  perCompany = 1
): Promise<NewsProcessResult> {
  const result: NewsProcessResult = { inserted: 0, skipped: 0, blocked: 0, failed: 0 };

  try {
    const items = await fetchRSS(company);
    let insertedForCompany = 0;

    for (const item of items.slice(0, Math.max(8, perCompany * 8))) {
      if (!item.title || !item.link) continue;

      const newsItem = {
        ticker: company.ticker,
        title: item.title,
        summary: summarize(item.title),
        url: item.link,
        source: sourceText(item.source),
        published_at: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
      };

      if (isBlockedNews(newsItem)) {
        result.blocked += 1;
        continue;
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("growth_news")
        .select("id")
        .eq("url", newsItem.url)
        .limit(1);

      if (existingError) {
        result.failed += 1;
        continue;
      }

      if ((existing ?? []).length > 0) {
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

export function mergeNewsResults(results: NewsProcessResult[]): NewsProcessResult {
  return results.reduce(
    (total, item) => ({
      inserted: total.inserted + item.inserted,
      skipped: total.skipped + item.skipped,
      blocked: total.blocked + item.blocked,
      failed: total.failed + item.failed,
    }),
    { inserted: 0, skipped: 0, blocked: 0, failed: 0 }
  );
}
