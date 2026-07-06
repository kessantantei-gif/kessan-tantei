"use client";

import { useEffect, useState } from "react";

type Signal = {
  type: "positive" | "caution" | "watch";
  title: string;
  detail: string;
};

type Payload = {
  ticker: string;
  companyName: string;
  positive: Signal[];
  caution: Signal[];
  watch: Signal[];
  summary: string;
  disclaimer: string;
};

type Props = {
  ticker: string;
};

function SignalBlock({ title, items, tone }: { title: string; items: Signal[]; tone: "green" | "yellow" | "cyan" }) {
  if (items.length === 0) return null;

  const toneClass = {
    green: "border-green-300/20 bg-green-500/10 text-green-100",
    yellow: "border-yellow-300/20 bg-yellow-500/10 text-yellow-100",
    cyan: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-sm font-black">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={`${item.title}-${item.detail}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-black text-white">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompanyFinancialSignals({ ticker }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/company/${ticker}/financial-signals`, { cache: "no-store" })
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
        <p className="text-xs font-bold tracking-[0.24em] text-green-200">FINANCIAL SIGNALS</p>
        <p className="mt-3 text-sm">財務シグナルを読み込み中です。</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-3xl border border-green-300/20 bg-gradient-to-br from-green-500/10 via-white/[0.04] to-yellow-500/10 p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.24em] text-green-200">FINANCIAL SIGNALS</p>
          <h2 className="mt-2 text-2xl font-black text-white">財務シグナル</h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            財務データから、良い点・注意点・確認ポイントを信号形式で整理します。
          </p>
        </div>
        <span className="w-fit rounded-full border border-green-300/20 bg-green-300/10 px-3 py-1 text-xs font-bold text-green-100">
          自動判定
        </span>
      </div>

      <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-8 text-slate-100 sm:text-base">
        {payload.summary}
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <SignalBlock title="良いシグナル" items={payload.positive} tone="green" />
        <SignalBlock title="注意シグナル" items={payload.caution} tone="yellow" />
        <SignalBlock title="確認ポイント" items={payload.watch} tone="cyan" />
      </div>

      <p className="mt-4 text-xs leading-6 text-slate-500">{payload.disclaimer}</p>
    </section>
  );
}
