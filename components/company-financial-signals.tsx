"use client";

import Link from "next/link";
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

function ProSignalCta({ hiddenCount }: { hiddenCount: number }) {
  return (
    <div className="mt-4 rounded-2xl border border-yellow-300/30 bg-yellow-400/10 p-4 text-sm leading-7 text-yellow-50">
      <p className="font-black text-yellow-200">🔒 財務シグナル詳細はPro限定</p>
      <p className="mt-1 text-slate-300">
        無料版では代表的なシグナルだけ表示しています。残り{hiddenCount}件の詳細、注意点、確認ポイントはProで確認できます。
      </p>
      <Link
        href="/pricing"
        className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-yellow-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-yellow-300"
      >
        Proでシグナルを確認する
      </Link>
    </div>
  );
}

function SignalBlock({ title, items, tone, isPro }: { title: string; items: Signal[]; tone: "green" | "yellow" | "cyan"; isPro: boolean }) {
  const visibleItems = isPro ? items : items.slice(0, 1);
  if (visibleItems.length === 0) return null;

  const toneClass = {
    green: "border-green-300/20 bg-green-500/10 text-green-100",
    yellow: "border-yellow-300/20 bg-yellow-500/10 text-yellow-100",
    cyan: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-sm font-black">{title}</p>
      <div className="mt-3 space-y-2">
        {visibleItems.map((item) => (
          <div key={`${item.title}-${item.detail}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-black text-white">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{item.detail}</p>
          </div>
        ))}
        {!isPro && items.length > visibleItems.length ? (
          <div className="rounded-xl border border-yellow-300/20 bg-yellow-400/10 p-3 text-xs font-bold text-yellow-100">
            🔒 残り{items.length - visibleItems.length}件はPro限定
          </div>
        ) : null}
      </div>
    </div>
  );
}

function previewSummary(text: string) {
  if (text.length <= 80) return text;
  return `${text.slice(0, 80)}…`;
}

export default function CompanyFinancialSignals({ ticker }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/company/${ticker}/financial-signals`, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)),
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
        <p className="text-xs font-bold tracking-[0.24em] text-green-200">FINANCIAL SIGNALS</p>
        <p className="mt-3 text-sm">財務シグナルを読み込み中です。</p>
      </section>
    );
  }

  const totalSignals = payload.positive.length + payload.caution.length + payload.watch.length;
  const visibleSignals = isPro ? totalSignals : [payload.positive, payload.caution, payload.watch].filter((items) => items.length > 0).length;
  const hiddenCount = Math.max(0, totalSignals - visibleSignals);

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
        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${isPro ? "border-green-300/20 bg-green-300/10 text-green-100" : "border-yellow-300/20 bg-yellow-300/10 text-yellow-100"}`}>
          {isPro ? "Pro 全件表示" : "一部無料 / 詳細Pro"}
        </span>
      </div>

      <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-8 text-slate-100 sm:text-base">
        {isPro ? payload.summary : previewSummary(payload.summary)}
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <SignalBlock title="良いシグナル" items={payload.positive} tone="green" isPro={isPro} />
        <SignalBlock title="注意シグナル" items={payload.caution} tone="yellow" isPro={isPro} />
        <SignalBlock title="確認ポイント" items={payload.watch} tone="cyan" isPro={isPro} />
      </div>

      {!isPro && hiddenCount > 0 ? <ProSignalCta hiddenCount={hiddenCount} /> : null}

      <p className="mt-4 text-xs leading-6 text-slate-500">{payload.disclaimer}</p>
    </section>
  );
}
