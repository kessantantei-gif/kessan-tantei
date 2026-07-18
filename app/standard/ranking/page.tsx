import type { Metadata } from "next";
import MarketRankingPage from "@/components/market-ranking-page";

export const metadata: Metadata = {
  title: "スタンダード市場ランキング | 決算探偵",
  description:
    "スタンダード市場の企業を、総合評価・成長性・収益性・営業CF・安全性・リスク・業種・テーマ別に比較します。",
  alternates: { canonical: "/standard/ranking" },
};

export default async function StandardRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  return <MarketRankingPage marketSlug="standard" rankingSlug={params.type} />;
}
