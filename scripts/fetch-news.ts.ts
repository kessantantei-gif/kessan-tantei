import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "../lib/supabase";

dotenv.config({ path: ".env.local" });

type GrowthCompany = {
  ticker: string;
  name: string;
};

type RssItem = {
  title?: string;
  link?: string;
  pubDate?: string;
};

const parser = new XMLParser();
const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

function summarize(title: string) {
  return title.length > 80 ? `${title.slice(0, 80)}...` : title;
}

function normalizeItems(items: RssItem | RssItem[] | undefined): RssItem[] {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

async function fetchRSS(keyword: string) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${keyword} 株式 OR 決算 OR 提携 OR 新サービス OR 上方修正`
  )}&hl=ja&gl=JP&ceid=JP:ja`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${keyword}`);
  }

  const xml = await res.text();
  const json = parser.parse(xml);

  return normalizeItems(json.rss?.channel?.item);
}

async function newsAlreadyExists(url: string) {
  const { data, error } = await supabaseAdmin
    .from("growth_news")
    .select("id")
    .eq("url", url)
    .limit(1);

  if (error) {
    console.error(error);
    return false;
  }

  return (data ?? []).length > 0;
}

async function insertNews(news: {
  ticker: string;
  title: string;
  summary: string;
  url: string;
  published_at: string;
}) {
  const exists = await newsAlreadyExists(news.url);

  if (exists) {
    console.log("SKIP:", news.title);
    return false;
  }

  const { error } = await supabaseAdmin.from("growth_news").insert(news);

  if (error) {
    console.error("INSERT FAILED:", error.message);
    return false;
  }

  console.log("INSERT:", news.title);
  return true;
}

async function main() {
  if (!fs.existsSync(masterPath)) {
    throw new Error("data/growth-companies.json が見つかりません");
  }

  const companies = JSON.parse(
    fs.readFileSync(masterPath, "utf8")
  ) as GrowthCompany[];

  const perCompany = Number(process.env.PER_COMPANY || 2);
  const waitMs = Number(process.env.WAIT_MS || 2500);

  console.log("===== Fetch Growth News Start =====");
  console.log("Targets:", companies.length);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const company of companies) {
    try {
      const items = await fetchRSS(company.name);

      for (const item of items.slice(0, perCompany)) {
        if (!item.title || !item.link) continue;

        const ok = await insertNews({
          ticker: company.ticker,
          title: item.title,
          summary: summarize(item.title),
          url: item.link,
          published_at: item.pubDate
            ? new Date(item.pubDate).toISOString()
            : new Date().toISOString(),
        });

        if (ok) inserted++;
        else skipped++;
      }
    } catch (error) {
      failed++;
      console.log("FAILED:", company.ticker, company.name);
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  console.log("===== Fetch Growth News Done =====");
  console.log("Inserted:", inserted);
  console.log("Skipped:", skipped);
  console.log("Failed:", failed);
}

main().catch(console.error);