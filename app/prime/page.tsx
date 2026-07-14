import type { Metadata } from "next";
import MarketBuildingPage from "@/components/market-building-page";

export const metadata: Metadata = {
  title: "プライム市場の決算分析 | 決算探偵",
  description:
    "プライム市場の企業を、収益力・資本効率・安定CF・財務安全性・株主還元から分析する決算探偵です。",
  alternates: { canonical: "/prime" },
};

export default function PrimeMarketPage() {
  return <MarketBuildingPage marketSlug="prime" />;
}
