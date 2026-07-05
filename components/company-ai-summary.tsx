"use client";

import { useEffect, useState } from "react";

type SummaryPayload = {
  ticker: string;
  companyName: string;
  summary: string;
  positives: string[];
  cautions: string[];
  watchPoints: string[];
  disclaimer: string;
};

type Props = {
  ticker: string;
};

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone: "green" | "yellow" | "cyan" }) {
  if (items.length === 0) return null;

  const toneClass = {
    green: "border-green-300/20 bg-green-500/10 text-green-100",
    yellow: "border-yellow-300/20 bg-yellow-500/10 text-yellow-100",
    cyan: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-sm font-black">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
        {items.map((item) => (
          <li key={item}>・{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function CompanyAiSummary({ ticker }: Props) {
  const [payload, setPayload] = useState<SummaryPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/company/${ticker}/ai-summary`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SummaryPayload | null) => {
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
        <p className="text-xs font-bold tracking-[0.24em] text-cyan-200">AI SUMMARY</p>
        <p className="mt-3 text-sm">決算サマリーを生成中です。</p>
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/12 via-white/[0.04] to-green-500/10 p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.24em] text-cyan-200">AI SUMMARY</p>
          <h2 className="mt-2 text-2xl font-black text-white">AI決算サマリー</h2>
          <p className="mt-1 text-sm font-bold text-slate-400">{payload.companyName} / {payload.ticker}</p>
        </div>
        <span className="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
          自動生成
        </span>
      </div>

      <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-8 text-slate-100 sm:text-base">
        {payload.summary}
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <ListBlock title="良い点" items={payload.positives} tone="green" />
        <ListBlock title="注意点" items={payload.cautions} tone="yellow" />
        <ListBlock title="確認ポイント" items={payload.watchPoints} tone="cyan" />
      </div>

      <p className="mt-4 text-xs leading-6 text-slate-500">
        {payload.disclaimer}
      </p>
    </section>
  );
}
