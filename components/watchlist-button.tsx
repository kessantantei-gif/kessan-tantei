"use client";

import { useEffect, useState } from "react";
import { addWatchlistItem, isWatchlisted, removeWatchlistItem } from "@/lib/watchlist";

type Props = {
  ticker: string;
  name: string;
  compact?: boolean;
};

export default function WatchlistButton({ ticker, name, compact = false }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(isWatchlisted(ticker));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kessan-watchlist-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kessan-watchlist-updated", sync);
    };
  }, [ticker]);

  function toggle() {
    if (active) {
      removeWatchlistItem(ticker);
      setActive(false);
      return;
    }
    addWatchlistItem(ticker, name);
    setActive(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        active
          ? "inline-flex min-h-10 items-center justify-center rounded-full border border-yellow-300/40 bg-yellow-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-yellow-950/20 transition active:scale-95"
          : "inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-slate-100 transition hover:border-yellow-300/40 hover:bg-yellow-400/10 active:scale-95"
      }
      aria-pressed={active}
    >
      {active ? "★ ウォッチ中" : compact ? "☆ 追加" : "☆ ウォッチリストに追加"}
    </button>
  );
}
