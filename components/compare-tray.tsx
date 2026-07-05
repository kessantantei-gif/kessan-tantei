"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CompareItem = {
  ticker: string;
  name: string;
};

const STORAGE_KEY = "kessan-tantei-compare";
const MAX_COMPARE = 5;

function readItems(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.ticker && item?.name)
      .slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

function writeItems(items: CompareItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_COMPARE)));
  window.dispatchEvent(new Event("kessan-compare-updated"));
}

export function addCompareItem(item: CompareItem) {
  const items = readItems();
  const exists = items.some((current) => current.ticker === item.ticker);
  const next = exists
    ? items.filter((current) => current.ticker !== item.ticker)
    : [...items, item].slice(0, MAX_COMPARE);
  writeItems(next);
  return !exists;
}

export default function CompareTray() {
  const [items, setItems] = useState<CompareItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readItems());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kessan-compare-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kessan-compare-updated", sync);
    };
  }, []);

  const href = useMemo(() => {
    const tickers = items.map((item) => item.ticker).join(",");
    return `/compare?tickers=${encodeURIComponent(tickers)}`;
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-4 right-4 z-50 mx-auto max-w-3xl rounded-3xl border border-cyan-300/20 bg-[#07111f]/95 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl sm:left-auto sm:right-6 sm:w-[460px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-cyan-200">
            比較中 {items.length}/{MAX_COMPARE}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {items.map((item) => (
              <button
                key={item.ticker}
                type="button"
                onClick={() => writeItems(items.filter((current) => current.ticker !== item.ticker))}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-100 hover:bg-red-500/20"
                title="クリックで比較から外す"
              >
                {item.name} ×
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <Link
            href={href}
            className="rounded-full bg-cyan-300 px-4 py-2 text-center text-sm font-black text-slate-950 hover:bg-cyan-200"
          >
            比較する
          </Link>
          <button
            type="button"
            onClick={() => writeItems([])}
            className="text-xs font-bold text-slate-400 hover:text-white"
          >
            クリア
          </button>
        </div>
      </div>
    </div>
  );
}
