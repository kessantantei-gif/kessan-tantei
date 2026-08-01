import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { rankingDefinitions } from "@/lib/rankings/definitions";
import { seoThemeIds } from "@/lib/seo-hubs";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp").replace(/\/$/, "");

export const dynamic = "force-dynamic";

type CompanySitemapRow = {
  ticker: string;
  last_financial_update: string | null;
  last_market_master_update: string | null;
  updated_at: string | null;
};

type AnalyzedCompanyRow = {
  ticker: string;
};

type StaticSitemapPath = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
  dataDriven?: boolean;
};

async function loadAllListedCompanies() {
  const rows: CompanySitemapRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("ticker, last_financial_update, last_market_master_update, updated_at")
      .eq("listing_status", "listed")
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`sitemap全上場会社取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as CompanySitemapRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function loadAllAnalyzedTickers() {
  const tickers = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("company_analyses")
      .select("ticker")
      .neq("risk_level", "EXCLUDED")
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`sitemap分析済み会社取得失敗: ${error.message}`);
    for (const row of (data ?? []) as AnalyzedCompanyRow[]) {
      if (row.ticker) tickers.add(row.ticker);
    }
    if ((data ?? []).length < pageSize) break;
  }

  return tickers;
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function companyLastModified(company: CompanySitemapRow) {
  return (
    validDate(company.last_financial_update) ??
    validDate(company.updated_at) ??
    validDate(company.last_market_master_update)
  );
}

function newestDate(values: Array<Date | null>) {
  const timestamps = values
    .filter((value): value is Date => value !== null)
    .map((value) => value.getTime());
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listedCompanies, analyzedTickers] = await Promise.all([
    loadAllListedCompanies(),
    loadAllAnalyzedTickers(),
  ]);
  const companies = listedCompanies.filter((company) => analyzedTickers.has(company.ticker));
  const latestFinancialUpdate = newestDate(companies.map(companyLastModified));

  const staticPaths: StaticSitemapPath[] = [
    { path: "", changeFrequency: "daily", priority: 1, dataDriven: true },
    { path: "/markets", changeFrequency: "daily", priority: 0.95, dataDriven: true },
    { path: "/latest-earnings", changeFrequency: "hourly", priority: 0.95, dataDriven: true },
    { path: "/standard", changeFrequency: "daily", priority: 0.9, dataDriven: true },
    { path: "/standard/ranking", changeFrequency: "daily", priority: 0.85, dataDriven: true },
    { path: "/prime", changeFrequency: "daily", priority: 0.9, dataDriven: true },
    { path: "/prime/ranking", changeFrequency: "daily", priority: 0.85, dataDriven: true },
    { path: "/updates", changeFrequency: "daily", priority: 0.9, dataDriven: true },
    { path: "/news", changeFrequency: "daily", priority: 0.8, dataDriven: true },
    { path: "/ranking", changeFrequency: "daily", priority: 0.9, dataDriven: true },
    { path: "/themes", changeFrequency: "daily", priority: 0.85, dataDriven: true },
    { path: "/features", changeFrequency: "daily", priority: 0.85 },
    { path: "/data-quality", changeFrequency: "daily", priority: 0.7, dataDriven: true },
    { path: "/about-growth", changeFrequency: "monthly", priority: 0.5 },
    { path: "/pricing", changeFrequency: "monthly", priority: 0.7 },
    { path: "/legal", changeFrequency: "yearly", priority: 0.2 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
    { path: "/disclaimer", changeFrequency: "yearly", priority: 0.2 },
  ];

  const staticPages: MetadataRoute.Sitemap = staticPaths.map(
    ({ path, changeFrequency, priority, dataDriven }) => ({
      url: `${appUrl}${path}`,
      changeFrequency,
      priority,
      ...(dataDriven && latestFinancialUpdate
        ? { lastModified: latestFinancialUpdate }
        : {}),
    })
  );

  const rankingPages: MetadataRoute.Sitemap = rankingDefinitions.map((ranking) => ({
    url: `${appUrl}/ranking/${ranking.slug}`,
    changeFrequency: "daily",
    priority: 0.8,
    ...(latestFinancialUpdate ? { lastModified: latestFinancialUpdate } : {}),
  }));

  const themePages: MetadataRoute.Sitemap = seoThemeIds.map((theme) => ({
    url: `${appUrl}/themes/${theme}`,
    changeFrequency: "daily",
    priority: 0.8,
    ...(latestFinancialUpdate ? { lastModified: latestFinancialUpdate } : {}),
  }));

  const companyPages: MetadataRoute.Sitemap = companies.map((company) => {
    const lastModified = companyLastModified(company);
    return {
      url: `${appUrl}/company/${company.ticker}`,
      changeFrequency: "weekly",
      priority: 0.75,
      ...(lastModified ? { lastModified } : {}),
    };
  });

  return [...staticPages, ...rankingPages, ...themePages, ...companyPages];
}
