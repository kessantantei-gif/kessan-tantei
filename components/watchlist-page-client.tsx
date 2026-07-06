"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readWatchlist, removeWatchlistItem, WatchlistItem, writeWatchlist } from "@/lib/watchlist";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "不明";
  }
}

export default function WatchlistPageClient() {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readWatchlist());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kessan-watchlist-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kessan-watchlist-updated", sync);
    };
  }, []);

  function remove(ticker: string) {
    setItems(removeWatchlistItem(ticker));
  }

  function clear() {
    writeWatchlist([]);
    setItems([]);
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(250,204,21,0.14),transparent_32%),radial-gradient(circle_at_top_left,_rgba(34,197,94,0.14),transparent_30%)]" />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.28em] text-slate-500">WATCHLIST</p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">ウォッチリスト</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              気になる企業を保存して、後からまとめて確認できます。今後の決算通知・スコア変化通知の土台になります。
            </p>
          </div>

          <Link href="/ranking" className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/10">
            ランキングへ戻る
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-yellow-300/20 bg-yellow-500/10 p-5 text-sm leading-7 text-yellow-50 sm:p-6">
          保存件数：<span className="font-black">{items.length}</span> 件。現在はこのブラウザに保存されます。ログイン連携・通知連携は次の段階で追加します。
        </div>

        {items.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-xl font-black text-white">まだウォッチ中の企業がありません</p>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              会社ページの「ウォッチリストに追加」から保存できます。
            </p>
            <Link href="/ranking" className="mt-5 inline-flex rounded-full bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300">
              ランキングから探す
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={clear} className="rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 hover:bg-red-500/20">
                全部クリア
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <div key={item.ticker} className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20">
                  <Link href={`/company/${item.ticker}`} className="block">
                    <p className="truncate text-xl font-black text-white hover:text-yellow-200">{item.name}</p>
                    <p className="mt-1 text-sm font-bold text-slate-500">{item.ticker}</p>
                    <p className="mt-3 text-xs text-slate-500">追加日：{formatDate(item.addedAt)}</p>
                  </Link>
                  <div className="mt-4 flex gap-2">
                    <Link href={`/company/${item.ticker}`} className="flex-1 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-center text-xs font-black text-slate-100 hover:bg-white/10">
                      会社ページ
                    </Link>
                    <button type="button" onClick={() => remove(item.ticker)} className="rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 hover:bg-red-500/20">
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5 text-xs leading-6 text-slate-500">
          ウォッチリストは銘柄の管理補助機能です。表示内容は個別銘柄の売買判断を示すものではありません。
        </p>
      </section>
    </main>
  );
}
