import type { Metadata } from "next";
import MarketDirectoryCallout from "@/components/market-directory-callout";
import GrowthHomePage from "./growth-home";

const siteUrl = "https://kessan-tantei.jp";
const title = "グロース市場の決算分析・財務ランキング | 決算探偵";
const description =
  "グロース市場の上場企業を、売上成長、営業利益、営業キャッシュフロー、財務スコア、リスクシグナルから比較・分析できます。";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "決算探偵",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "決算探偵 グロース市場の決算分析・財務ランキング",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${siteUrl}/opengraph-image`],
  },
};

export default function GrowthMarketHomePage() {
  return (
    <>
      <GrowthHomePage />
      <MarketDirectoryCallout marketSlug="growth" />
    </>
  );
}
