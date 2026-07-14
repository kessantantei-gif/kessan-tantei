import type { Metadata } from "next";
import MarketRankingPage from "@/components/market-ranking-page";

export const metadata: Metadata = {
  title: "スタンダード市場ランキング | 決算探偵",
  description:
    "スタンダード市場の企業を、総合スコア・売上高・営業利益・営業CF・Danger Scoreで比較します。",
  alternates: { canonical: "/standard/ranking" },
};

export default async function StandardRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string }>;
}) {
  const params = await searchParams;
  return <MarketRankingPage marketSlug="standard" metricValue={params.metric} />;
}
