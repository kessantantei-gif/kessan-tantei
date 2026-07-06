"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCondition,
  AlertSetting,
  alertConditionLabels,
  defaultAlertConditions,
  readAlertSettings,
  removeAlertSetting,
  toggleAlertSetting,
  upsertAlertSetting,
  writeAlertSettings,
} from "@/lib/alerts";
import { readWatchlist } from "@/lib/watchlist";

const allConditions = Object.keys(alertConditionLabels) as AlertCondition[];

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

export default function AlertsPageClient() {
  const [settings, setSettings] = useState<AlertSetting[]>([]);
  const [watchlistCount, setWatchlistCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      setSettings(readAlertSettings());
      setWatchlistCount(readWatchlist().length);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kessan-alerts-updated", sync);
    window.addEventListener("kessan-watchlist-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kessan-alerts-updated", sync);
      window.removeEventListener("kessan-watchlist-updated", sync);
    };
  }, []);

  function importFromWatchlist() {
    const watchlist = readWatchlist();
    let next = readAlertSettings();
    for (const item of watchlist) {
      upsertAlertSetting(item.ticker, item.name, defaultAlertConditions);
      next = readAlertSettings();
    }
    setSettings(next);
    setWatchlistCount(watchlist.length);
  }

  function toggleCondition(ticker: string, condition: AlertCondition) {
    const now = new Date().toISOString();
    const next = settings.map((item) => {
      if (item.ticker !== ticker) return item;
      const has = item.conditions.includes(condition);
      return {
        ...item,
        conditions: has
          ? item.conditions.filter((current) => current !== condition)
          : [...item.conditions, condition],
        updatedAt: now,
      };
    });
    writeAlertSettings(next);
    setSettings(next);
  }

  function remove(ticker: string) {
    setSettings(removeAlertSetting(ticker));
  }

  function toggle(ticker: string) {
    setSettings(toggleAlertSetting(ticker));
  }

  function clear() {
    writeAlertSettings([]);
    setSettings([]);
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.14),transparent_32%),radial-gradient(circle_at_top_left,_rgba(250,204,21,0.14),transparent_30%)]" />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.28em] text-slate-500">ALERTS</p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">アラート設定</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              ウォッチ銘柄の決算更新・スコア変化・リスク悪化を追うための通知条件を設定します。現在は通知対象の管理まで対応し、メール配信はログイン連携後に有効化します。
            </p>
          </div>

          <Link href="/watchlist" className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/10">
            ウォッチリストへ
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-5">
            <p className="text-xs font-bold tracking-[0.2em] text-cyan-200">WATCHLIST</p>
            <p className="mt-3 text-4xl font-black text-white">{watchlistCount}</p>
            <p className="mt-2 text-sm text-slate-300">ウォッチ中の企業数</p>
          </div>
          <div className="rounded-3xl border border-yellow-300/20 bg-yellow-500/10 p-5">
            <p className="text-xs font-bold tracking-[0.2em] text-yellow-200">ALERTS</p>
            <p className="mt-3 text-4xl font-black text-white">{settings.length}</p>
            <p className="mt-2 text-sm text-slate-300">アラート設定数</p>
          </div>
          <div className="rounded-3xl border border-green-300/20 bg-green-500/10 p-5">
            <p className="text-xs font-bold tracking-[0.2em] text-green-200">ENABLED</p>
            <p className="mt-3 text-4xl font-black text-white">{settings.filter((item) => item.enabled).length}</p>
            <p className="mt-2 text-sm text-slate-300">有効なアラート</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={importFromWatchlist} className="rounded-full bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300 active:scale-95">
            ウォッチリストから作成
          </button>
          {settings.length > 0 ? (
            <button type="button" onClick={clear} className="rounded-full border border-red-300/20 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 hover:bg-red-500/20 active:scale-95">
              全部クリア
            </button>
          ) : null}
        </div>

        {settings.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-xl font-black text-white">まだアラート設定がありません</p>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              まずウォッチリストに企業を追加し、「ウォッチリストから作成」を押してください。
            </p>
            <Link href="/ranking" className="mt-5 inline-flex rounded-full bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300">
              ランキングから探す
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {settings.map((item) => (
              <div key={item.ticker} className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <Link href={`/company/${item.ticker}`} className="text-xl font-black text-white hover:text-yellow-200">
                      {item.name}
                    </Link>
                    <p className="mt-1 text-sm font-bold text-slate-500">{item.ticker} / 更新日 {formatDate(item.updatedAt)}</p>
                    <p className={item.enabled ? "mt-3 text-sm font-black text-green-200" : "mt-3 text-sm font-black text-slate-500"}>
                      {item.enabled ? "有効" : "停止中"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => toggle(item.ticker)} className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-slate-100 hover:bg-white/10">
                      {item.enabled ? "停止" : "再開"}
                    </button>
                    <button type="button" onClick={() => remove(item.ticker)} className="rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 hover:bg-red-500/20">
                      削除
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {allConditions.map((condition) => {
                    const active = item.conditions.includes(condition);
                    return (
                      <button
                        key={condition}
                        type="button"
                        onClick={() => toggleCondition(item.ticker, condition)}
                        className={
                          active
                            ? "rounded-2xl border border-yellow-300/30 bg-yellow-400/15 px-4 py-3 text-left text-sm font-black text-yellow-100"
                            : "rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-black text-slate-400 hover:bg-white/10"
                        }
                      >
                        {active ? "✓ " : "＋ "}{alertConditionLabels[condition]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5 text-xs leading-6 text-slate-500">
          アラートは決算情報の確認補助です。通知条件は個別銘柄の売買判断を示すものではありません。
        </p>
      </section>
    </main>
  );
}
