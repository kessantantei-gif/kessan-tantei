import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { rankingDefinitions } from "@/lib/rankings/definitions";
import { seoThemeIds } from "@/lib/seo-hubs";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp").replace(/\/$/, "");

export const dynamic = "force-dynamic";

type CompanySitemapRow = {
  ticker: string;
  updated_at?: string | null;
  created_at?: string | null;
  risk_level?: string | null;
};

async function loadAllCompanies() {
  const rows: CompanySitemapRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("company_analyses")
      .select("ticker, updated_at, created_at, risk_level")
      .neq("risk_level", "EXCLUDED")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`sitemap会社取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as CompanySitemapRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPaths = [
    ["", "daily", 1],
    ["/markets", "daily", 0.95],
    ["/growth", "daily", 0.9],
    ["/standard", "daily", 0.9],
    ["/standard/ranking", "daily", 0.85],
    ["/prime", "daily", 0.9],
    ["/prime/ranking", "daily", 0.85],
    ["/updates", "daily", 0.9],
    ["/news", "daily", 0.8],
    ["/ranking", "daily", 0.9],
    ["/themes", "daily", 0.85],
    ["/features", "daily", 0.85],
    ["/data-quality", "daily", 0.7],
    ["/about-growth", "monthly", 0.5],
    ["/pricing", "monthly", 0.7],
    ["/legal", "yearly", 0.2],
    ["/privacy", "yearly", 0.2],
    ["/terms", "yearly", 0.2],
    ["/disclaimer", "yearly", 0.2],
  ] as const;

  const staticPages: MetadataRoute.Sitemap = staticPaths.map(
    ([path, changeFrequency, priority]) => ({
      url: `${appUrl}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    })
  );

  const rankingPages: MetadataRoute.Sitemap = rankingDefinitions.map(
    (ranking) => ({
      url: `${appUrl}/ranking/${ranking.slug}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    })
  );

  const themePages: MetadataRoute.Sitemap = seoThemeIds.map((theme) => ({
    url: `${appUrl}/themes/${theme}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const companies = await loadAllCompanies();
  const companyPages: MetadataRoute.Sitemap = companies.map((company) => ({
    url: `${appUrl}/company/${company.ticker}`,
    lastModified: company.updated_at || company.created_at || now,
    changeFrequency: "daily",
    priority: 0.9,
  }));

  return [...staticPages, ...rankingPages, ...themePages, ...companyPages];
}
