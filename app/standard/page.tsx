import type { Metadata } from "next";
import MarketBuildingPage from "@/components/market-building-page";

export const metadata: Metadata = {
  title: "スタンダード市場の決算分析 | 決算探偵",
  description:
    "スタンダード市場の企業を、成長性・割安性・財務安全性・営業CF・株主還元から分析する決算探偵です。",
  alternates: { canonical: "/standard" },
};

export default function StandardMarketPage() {
  return <MarketBuildingPage marketSlug="standard" />;
}
