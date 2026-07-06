"use client";

import { useEffect, useState } from "react";
import { addWatchlistItem, isWatchlisted, removeWatchlistItem } from "@/lib/watchlist";

type Props = {
  ticker: string;
  name?: string;
};

export default function WatchButton({ ticker, name }: Props) {
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    const sync = () => setWatched(isWatchlisted(ticker));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kessan-watchlist-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kessan-watchlist-updated", sync);
    };
  }, [ticker]);

  function toggleWatch() {
    if (watched) {
      removeWatchlistItem(ticker);
      setWatched(false);
      return;
    }

    addWatchlistItem(ticker, name || ticker);
    setWatched(true);
  }

  return (
    <button
      type="button"
      onClick={toggleWatch}
      className={
        watched
          ? "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full bg-yellow-400 px-4 py-2 text-xs font-black text-slate-950 transition active:scale-95 sm:text-sm"
          : "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white transition hover:bg-white/20 active:scale-95 sm:text-sm"
      }
    >
      {watched ? "★ ウォッチ中" : "☆ ウォッチ"}
    </button>
  );
}
