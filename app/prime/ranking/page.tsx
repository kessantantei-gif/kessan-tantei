import type { Metadata } from "next";
import MarketRankingPage from "@/components/market-ranking-page";

export const metadata: Metadata = {
  title: "プライム市場ランキング | 決算探偵",
  description:
    "プライム市場の企業を、総合評価・成長性・収益性・営業CF・安全性・リスク・業種・テーマ別に比較します。",
  alternates: { canonical: "/prime/ranking" },
};

export default async function PrimeRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  return <MarketRankingPage marketSlug="prime" rankingSlug={params.type} />;
}
