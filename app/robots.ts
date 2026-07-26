import type { MetadataRoute } from "next";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/profile", "/api", "/ops"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
