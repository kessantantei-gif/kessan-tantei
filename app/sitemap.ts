import type { MetadataRoute } from "next";
import {
  MARKET_COMPANY_PAGE_SIZE,
} from "@/lib/market-company-directory";
import { marketList, type MarketSlug } from "@/lib/markets";
import { rankingDefinitions } from "@/lib/rankings/definitions";
import { seoThemeIds } from "@/lib/seo-hubs";
import { supabaseAdmin } from "@/lib/supabase";

const appUrl = "https://kessan-tantei.jp";

export const dynamic = "force-dynamic";

type CompanySitemapRow = {
  ticker: string;
  market_segment: string | null;
  last_financial_update: string | null;
  last_market_master_update: string | null;
  updated_at: string | null;
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
      .select(
        "ticker, market_segment, last_financial_update, last_market_master_update, updated_at"
      )
      .eq("listing_status", "listed")
      .in("market_segment", ["growth", "standard", "prime"])
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`sitemap全上場会社取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as CompanySitemapRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
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

function isMarketSlug(value: string | null): value is MarketSlug {
  return value === "growth" || value === "standard" || value === "prime";
}

function marketDirectoryPath(market: MarketSlug, pageNumber: number) {
  return pageNumber <= 1
    ? `/companies/${market}`
    : `/companies/${market}/${pageNumber}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const companies = await loadAllListedCompanies();
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

  const directoryPages: MetadataRoute.Sitemap = marketList.flatMap((market) => {
    const marketCompanies = companies.filter(
      (company) =>
        isMarketSlug(company.market_segment) && company.market_segment === market.slug
    );
    const totalPages = Math.ceil(
      marketCompanies.length / MARKET_COMPANY_PAGE_SIZE
    );
    const lastModified = newestDate(marketCompanies.map(companyLastModified));

    return Array.from({ length: totalPages }, (_, index) => ({
      url: `${appUrl}${marketDirectoryPath(market.slug, index + 1)}`,
      changeFrequency: "daily" as const,
      priority: index === 0 ? 0.88 : 0.8,
      ...(lastModified ? { lastModified } : {}),
    }));
  });

  const companyPages: MetadataRoute.Sitemap = companies.map((company) => {
    const lastModified = companyLastModified(company);
    return {
      url: `${appUrl}/company/${company.ticker}`,
      changeFrequency: "weekly",
      priority: 0.75,
      ...(lastModified ? { lastModified } : {}),
    };
  });

  return [
    ...staticPages,
    ...rankingPages,
    ...themePages,
    ...directoryPages,
    ...companyPages,
  ];
}
