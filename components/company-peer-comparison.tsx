"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PeerCompany = {
  ticker: string;
  companyName: string;
  isTarget?: boolean;
  score: number | null;
  dangerScore: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  operatingCFMargin: number | null;
  equityRatio: number | null;
};

type ComparisonGroup = {
  id: string;
  label: string;
  description: string;
  basis: string[];
  freeLimit: number;
  proOnly: boolean;
  companies: PeerCompany[];
};

type Payload = {
  ticker: string;
  companyName: string;
  peerBasis: "industry" | "similar-metrics" | "multi-axis";
  note: string;
  groups?: ComparisonGroup[];
  companies: PeerCompany[];
  disclaimer: string;
};

type Props = { ticker: string };

function pct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function num(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

function tone(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-500";
  if (value >= 30) return "text-green-200";
  if (value >= 0) return "text-yellow-200";
  return "text-red-200";
}

function ProComparisonLock({ hiddenCount }: { hiddenCount: number }) {
  return (
    <div className="rounded-2xl border border-yellow-300/30 bg-yellow-400/10 p-4 text-sm leading-7 text-yellow-50">
      <p className="font-black text-yellow-200">🔒 Pro限定の比較候補があります</p>
      <p className="mt-1 text-slate-300">
        無料版では一部だけ表示しています。残り{hiddenCount}件の比較候補はProで確認できます。
      </p>
      <Link href="/pricing" className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-yellow-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-yellow-300">
        Proで比較を開放する
      </Link>
    </div>
  );
}

function CompanyMiniCard({ company }: { company: PeerCompany }) {
  return (
    <Link
      href={`/company/${company.ticker}`}
      className={company.isTarget
        ? "min-w-0 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4"
        : "min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-white/10"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-black leading-snug text-white sm:text-lg">{company.companyName}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{company.ticker}</p>
        </div>
        {company.isTarget ? <span className="shrink-0 rounded-full bg-cyan-300 px-2 py-1 text-[10px] font-black text-slate-950">対象</span> : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-slate-500">Score</p>
          <p className="mt-1 text-xl font-black text-cyan-100">{num(company.score)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-slate-500">売上成長</p>
          <p className={`mt-1 text-xl font-black ${tone(company.revenueGrowth)}`}>{pct(company.revenueGrowth)}</p>
        </div>
      </div>
    </Link>
  );
}

export default function CompanyPeerComparison({ ticker }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/company/${ticker}/peer-comparison`, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)),
      fetch("/api/pro-status", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([data, status]: [Payload | null, { isPro?: boolean } | null]) => {
        if (cancelled) return;
        if (!data) {
          setFailed(true);
          return;
        }
        setPayload(data);
        setIsPro(Boolean(status?.isPro));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (failed) return null;

  if (!payload) {
    return (
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 text-slate-300 sm:p-6">
        <p className="text-xs font-bold tracking-[0.24em] text-green-200">COMPARISON</p>
        <p className="mt-3 text-sm">比較候補を読み込み中です。</p>
      </section>
    );
  }

  const groups = payload.groups?.length
    ? payload.groups
    : [{ id: "peer", label: "比較候補", description: payload.note, basis: ["スコア", "主要財務指標"], freeLimit: 3, proOnly: payload.companies.length > 3, companies: payload.companies }];

  return (
    <section className="mt-6 rounded-3xl border border-green-300/20 bg-gradient-to-br from-green-500/10 via-white/[0.04] to-cyan-500/10 p-4 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.24em] text-green-200">COMPARISON</p>
          <h2 className="mt-2 text-2xl font-black text-white">比較候補</h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">{payload.note}</p>
        </div>
        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${isPro ? "border-green-300/20 bg-green-300/10 text-green-100" : "border-yellow-300/20 bg-yellow-300/10 text-yellow-100"}`}>
          {isPro ? "Pro 全件表示" : "一部無料 / 全件Pro"}
        </span>
      </div>

      <div className="mt-5 space-y-5">
        {groups.map((group) => {
          const visible = isPro ? group.companies : group.companies.slice(0, group.freeLimit + 1);
          const hiddenCount = Math.max(0, group.companies.length - visible.length);

          return (
            <div key={group.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-black text-white">{group.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{group.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.basis.slice(0, 4).map((item) => (
                    <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">{item}</span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {visible.map((company) => <CompanyMiniCard key={`${group.id}-${company.ticker}`} company={company} />)}
              </div>

              {!isPro && hiddenCount > 0 ? <div className="mt-3"><ProComparisonLock hiddenCount={hiddenCount} /></div> : null}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs leading-6 text-slate-500">{payload.disclaimer}</p>
    </section>
  );
}
