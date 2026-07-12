import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { rankingDefinitions } from "@/lib/rankings/definitions";
import { seoThemeIds } from "@/lib/seo-hubs";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp").replace(/\/$/, "");

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: appUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${appUrl}/updates`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${appUrl}/news`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${appUrl}/ranking`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${appUrl}/themes`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${appUrl}/features`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${appUrl}/data-quality`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${appUrl}/about-growth`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const rankingPages: MetadataRoute.Sitemap = rankingDefinitions.map(
    (ranking) => ({
      url: `${appUrl}/ranking/${ranking.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    })
  );

  const themePages: MetadataRoute.Sitemap = seoThemeIds.map((theme) => ({
    url: `${appUrl}/themes/${theme}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const { data } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, updated_at, created_at, risk_level")
    .neq("risk_level", "EXCLUDED")
    .limit(1000);

  const companyPages: MetadataRoute.Sitemap = (data ?? []).map((company) => ({
    url: `${appUrl}/company/${company.ticker}`,
    lastModified: company.updated_at || company.created_at || new Date(),
    changeFrequency: "daily",
    priority: 0.9,
  }));

  return [...staticPages, ...rankingPages, ...themePages, ...companyPages];
}
