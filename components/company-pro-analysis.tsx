"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LockedInsight = {
  title: string;
  detail: string;
};

type Payload = {
  ticker: string;
  companyName: string;
  freePreview: string[];
  lockedInsights: LockedInsight[];
  cta: string;
  disclaimer: string;
};

type Props = {
  ticker: string;
};

export default function CompanyProAnalysis({ ticker }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/company/${ticker}/pro-analysis`, { cache: "no-store" })
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
        <p className="text-xs font-bold tracking-[0.24em] text-yellow-200">PRO ANALYSIS</p>
        <p className="mt-3 text-sm">Pro分析を読み込み中です。</p>
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-yellow-300/30 bg-gradient-to-br from-yellow-500/15 via-white/[0.04] to-green-500/10 p-[1px] shadow-2xl shadow-yellow-950/20">
      <div className="rounded-3xl bg-[#080b14]/92 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.24em] text-yellow-200">PRO ANALYSIS</p>
            <h2 className="mt-2 text-2xl font-black text-white">Pro専用分析</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              成長の質・キャッシュ創出力・財務耐久力・リスク深掘りをまとめて確認できます。
            </p>
          </div>
          <span className="w-fit rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-slate-950">
            Pro限定
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-sm font-black text-white">無料プレビュー</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
            {payload.freePreview.map((item) => (
              <li key={item}>・{item}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          {payload.lockedInsights.map((item) => (
            <div key={item.title} className="relative overflow-hidden rounded-2xl border border-yellow-300/20 bg-yellow-500/10 p-4">
              <div className="absolute inset-0 backdrop-blur-[2px]" />
              <div className="relative">
                <p className="text-sm font-black text-yellow-100">🔒 {item.title}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-300 blur-[1.5px] select-none">
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-7 text-slate-300">
            Proでは、上記の詳細分析を銘柄ごとに確認できます。
          </p>
          <Link href="/pricing" className="inline-flex min-h-11 items-center justify-center rounded-full bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300 active:scale-95">
            {payload.cta}
          </Link>
        </div>

        <p className="mt-4 text-xs leading-6 text-slate-500">{payload.disclaimer}</p>
      </div>
    </section>
  );
}
