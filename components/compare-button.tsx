"use client";

import { useEffect, useState } from "react";
import { addCompareItem } from "./compare-tray";

type Props = {
  ticker: string;
  name: string;
};

export default function CompareButton({ ticker, name }: Props) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        const raw = window.localStorage.getItem("kessan-tantei-compare");
        const items = raw ? JSON.parse(raw) : [];
        setAdded(Array.isArray(items) && items.some((item) => item.ticker === ticker));
      } catch {
        setAdded(false);
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kessan-compare-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kessan-compare-updated", sync);
    };
  }, [ticker]);

  return (
    <button
      type="button"
      onClick={() => setAdded(addCompareItem({ ticker, name }))}
      className={
        added
          ? "rounded-full border border-cyan-300/30 bg-cyan-300/15 px-4 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-300/25"
          : "rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-slate-100 hover:bg-white/15"
      }
    >
      {added ? "比較に追加済み" : "＋比較に追加"}
    </button>
  );
}
