import type { Metadata } from "next";
import WatchlistPageClient from "@/components/watchlist-page-client";

export const metadata: Metadata = {
  title: "ウォッチリスト | 決算探偵",
  description: "決算探偵のウォッチリストページです。気になる企業を保存して、後から確認できます。",
};

export default function WatchlistPage() {
  return <WatchlistPageClient />;
}
