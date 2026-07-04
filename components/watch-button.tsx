"use client";

import { useEffect, useState } from "react";

type Props = {
  ticker: string;
};

export default function WatchButton({ ticker }: Props) {
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("watchlist") || "[]");
    setWatched(stored.includes(ticker));
  }, [ticker]);

  function toggleWatch() {
    const stored = JSON.parse(localStorage.getItem("watchlist") || "[]");

    let next: string[];

    if (stored.includes(ticker)) {
      next = stored.filter((x: string) => x !== ticker);
      setWatched(false);
    } else {
      next = [...stored, ticker];
      setWatched(true);
    }

    localStorage.setItem("watchlist", JSON.stringify(next));
  }

  return (
    <button
      onClick={toggleWatch}
      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
        watched
          ? "bg-yellow-400 text-black"
          : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {watched ? "⭐ ウォッチ中" : "☆ ウォッチ追加"}
    </button>
  );
}