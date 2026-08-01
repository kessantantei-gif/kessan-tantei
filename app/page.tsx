import type { Metadata } from "next";
import GrowthHomePage from "./growth-home";

export const metadata: Metadata = {
  title: "グロース市場の決算分析・財務ランキング | 決算探偵",
  description:
    "グロース市場の上場企業を、売上成長、営業利益、営業キャッシュフロー、財務スコア、リスクシグナルから比較・分析できます。",
  alternates: {
    canonical: "/",
  },
};

export default GrowthHomePage;
