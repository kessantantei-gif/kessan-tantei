import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { rankingDefinitions } from "@/lib/rankings/definitions";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.kessan-tantei.jp";

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

  return [...staticPages, ...rankingPages, ...companyPages];
}
