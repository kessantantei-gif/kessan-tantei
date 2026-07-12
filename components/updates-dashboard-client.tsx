"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readRecentCompanies, type RecentCompanyItem } from "@/lib/recent-companies";
import { readWatchlist, type WatchlistItem } from "@/lib/watchlist";

type CompanyUpdate = {
  ticker: string;
  companyName: string;
  score: number | null;
  dangerScore: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  operatingCFMargin: number | null;
  updatedAt: string | null;
};

type Props = {
  updates: CompanyUpdate[];
  isPro: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "更新日不明";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新日不明";
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function CompanyCard({ company, badge }: { company: CompanyUpdate; badge?: string }) {
  return (
    <Link
      href={`/company/${company.ticker}`}
      className="block rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-green-400/40 hover:bg-white/[0.07]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-black text-white">{company.companyName}</p>
          <p className="mt-1 text-xs text-slate-500">{company.ticker}・{formatDate(company.updatedAt)}</p>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full bg-green-400/15 px-3 py-1 text-xs font-black text-green-200">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-white/5 p-2">
          <p className="text-slate-500">スコア</p>
          <p className="mt-1 font-black text-white">{company.score ?? "—"}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-2">
          <p className="text-slate-500">売上成長</p>
          <p className="mt-1 font-black text-green-200">{pct(company.revenueGrowth)}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-2">
          <p className="text-slate-500">Danger</p>
          <p className="mt-1 font-black text-red-200">{company.dangerScore ?? "—"}</p>
        </div>
      </div>
    </Link>
  );
}

export default function UpdatesDashboardClient({ updates, isPro }: Props) {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [recent, setRecent] = useState<RecentCompanyItem[]>([]);

  useEffect(() => {
    const sync = () => {
      setWatchlist(readWatchlist());
      setRecent(readRecentCompanies());
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("kessan-watchlist-updated", sync);
    window.addEventListener("kessan-recent-companies-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("kessan-watchlist-updated", sync);
      window.removeEventListener("kessan-recent-companies-updated", sync);
    };
  }, []);

  const updateMap = useMemo(
    () => new Map(updates.map((company) => [company.ticker, company])),
    [updates]
  );

  const watchedUpdates = watchlist
    .map((item) => {
      const company = updateMap.get(item.ticker);
      if (!company) return null;
      const updatedAt = company.updatedAt ? new Date(company.updatedAt).getTime() : 0;
      const addedAt = new Date(item.addedAt).getTime();
      return { company, changedAfterWatch: updatedAt > addedAt };
    })
    .filter((item): item is { company: CompanyUpdate; changedAfterWatch: boolean } => Boolean(item))
    .sort((a, b) => Number(b.changedAfterWatch) - Number(a.changedAfterWatch));

  const recentCompanies = recent
    .map((item) => updateMap.get(item.ticker))
    .filter((company): company is CompanyUpdate => Boolean(company));

  const visibleUpdates = isPro ? updates.slice(0, 30) : updates.slice(0, 6);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-green-400/20 bg-green-500/10 p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.25em] text-green-300">LATEST UPDATES</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">新しく更新された企業</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              決算データの更新日時が新しい企業を並べています。
            </p>
          </div>
          <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-300">
            {isPro ? "Pro：30社表示" : "Free：6社表示"}
          </span>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleUpdates.map((company, index) => (
            <CompanyCard key={company.ticker} company={company} badge={index < 3 ? "NEW" : undefined} />
          ))}
        </div>
        {!isPro && updates.length > 6 ? (
          <div className="mt-6 rounded-2xl border border-yellow-400/25 bg-yellow-500/10 p-5 text-center">
            <p className="font-black text-yellow-100">残り{Math.max(0, Math.min(24, updates.length - 6))}社の更新はProで確認</p>
            <Link href="/pricing" className="mt-4 inline-flex rounded-full bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300">
              初月100円で更新一覧を見る
            </Link>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-5 sm:p-7">
        <p className="text-xs font-black tracking-[0.25em] text-yellow-300">WATCHLIST</p>
        <h2 className="mt-2 text-2xl font-black sm:text-3xl">ウォッチ中企業の更新</h2>
        {watchedUpdates.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-slate-300">
            ウォッチ中の企業はまだありません。会社ページの「☆ ウォッチ」から追加できます。
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {watchedUpdates.map(({ company, changedAfterWatch }) => (
              <CompanyCard
                key={company.ticker}
                company={company}
                badge={changedAfterWatch ? "追加後に更新" : "ウォッチ中"}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5 sm:p-7">
        <p className="text-xs font-black tracking-[0.25em] text-cyan-300">RECENTLY VIEWED</p>
        <h2 className="mt-2 text-2xl font-black sm:text-3xl">最近見た企業</h2>
        {recentCompanies.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-slate-300">
            会社ページを閲覧すると、ここからすぐ戻れるようになります。
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentCompanies.map((company) => (
              <CompanyCard key={company.ticker} company={company} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
