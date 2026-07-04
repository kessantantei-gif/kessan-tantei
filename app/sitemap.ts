import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase";

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
      url: `${appUrl}/ranking/score`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${appUrl}/ranking/revenue`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${appUrl}/ranking/operating-income`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${appUrl}/ranking/operating-cf`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${appUrl}/ranking/danger`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${appUrl}/about-growth`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

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

  return [...staticPages, ...companyPages];
}