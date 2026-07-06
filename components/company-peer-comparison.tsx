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
  industry?: string | null;
};

type Payload = {
  ticker: string;
  companyName: string;
  peerBasis: "industry" | "similar-metrics";
  note: string;
  companies: PeerCompany[];
  disclaimer: string;
};

type Props = {
  ticker: string;
};

function pct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function num(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

function tone(value: number | null, reverse = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-500";
  const good = reverse ? value <= 30 : value >= 30;
  const warn = reverse ? value <= 60 : value >= 0;
  if (good) return "text-green-200";
  if (warn) return "text-yellow-200";
  return "text-red-200";
}

const rows = [
  { label: "総合スコア", get: (c: PeerCompany) => num(c.score), tone: (c: PeerCompany) => tone(c.score) },
  { label: "Danger", get: (c: PeerCompany) => num(c.dangerScore), tone: (c: PeerCompany) => tone(c.dangerScore, true) },
  { label: "売上成長率", get: (c: PeerCompany) => pct(c.revenueGrowth), tone: (c: PeerCompany) => tone(c.revenueGrowth) },
  { label: "営業利益率", get: (c: PeerCompany) => pct(c.operatingMargin), tone: (c: PeerCompany) => tone(c.operatingMargin) },
  { label: "営業CF率", get: (c: PeerCompany) => pct(c.operatingCFMargin), tone: (c: PeerCompany) => tone(c.operatingCFMargin) },
  { label: "自己資本比率", get: (c: PeerCompany) => pct(c.equityRatio), tone: (c: PeerCompany) => tone(c.equityRatio) },
];

export default function CompanyPeerComparison({ ticker }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/company/${ticker}/peer-comparison`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Payload | null) => {
        if (cancelled) return;
        if (!data) {
          setFailed(true);
          return;
        }
        setPayload(data);
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
        <p className="text-xs font-bold tracking-[0.24em] text-green-200">PEER COMPARISON</p>
        <p className="mt-3 text-sm">同業比較を読み込み中です。</p>
      </section>
    );
  }

  if (payload.companies.length <= 1) return null;

  return (
    <section className="mt-6 rounded-3xl border border-green-300/20 bg-gradient-to-br from-green-500/10 via-white/[0.04] to-cyan-500/10 p-4 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.24em] text-green-200">PEER COMPARISON</p>
          <h2 className="mt-2 text-2xl font-black text-white">同業比較</h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">{payload.note}</p>
        </div>
        <span className="w-fit rounded-full border border-green-300/20 bg-green-300/10 px-3 py-1 text-xs font-bold text-green-100">
          {payload.peerBasis === "industry" ? "業種優先" : "近似指標"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {payload.companies.map((company) => (
          <Link
            key={company.ticker}
            href={`/company/${company.ticker}`}
            className={
              company.isTarget
                ? "min-w-0 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4"
                : "min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-white/10"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-lg font-black leading-snug text-white">{company.companyName}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{company.ticker}</p>
              </div>
              {company.isTarget ? (
                <span className="shrink-0 rounded-full bg-cyan-300 px-2 py-1 text-[10px] font-black text-slate-950">対象</span>
              ) : null}
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
        ))}
      </div>

      <div className="mt-5 hidden overflow-hidden rounded-2xl border border-white/10 bg-black/20 md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04]">
                <th className="sticky left-0 z-10 bg-[#101423] px-4 py-3 text-xs font-black tracking-[0.18em] text-slate-400">指標</th>
                {payload.companies.map((company) => (
                  <th key={company.ticker} className="px-4 py-3 text-sm font-black text-white">
                    {company.companyName}
                    <p className="mt-1 text-xs text-slate-500">{company.ticker}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-white/10 last:border-b-0">
                  <th className="sticky left-0 z-10 bg-[#101423] px-4 py-3 text-sm font-black text-slate-300">{row.label}</th>
                  {payload.companies.map((company) => (
                    <td key={`${company.ticker}-${row.label}`} className={`px-4 py-3 text-lg font-black ${row.tone(company)}`}>
                      {row.get(company)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs leading-6 text-slate-500">{payload.disclaimer}</p>
    </section>
  );
}
