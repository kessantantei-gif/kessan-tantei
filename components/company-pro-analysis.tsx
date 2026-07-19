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

type AccessState = "checking" | "locked" | "allowed" | "failed";

export default function CompanyProAnalysis({ ticker }: Props) {
  const [access, setAccess] = useState<AccessState>("checking");
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const statusResponse = await fetch("/api/pro-status", { cache: "no-store" });
        const status = statusResponse.ok
          ? ((await statusResponse.json()) as { isPro?: boolean })
          : null;

        if (cancelled) return;
        if (!status?.isPro) {
          setAccess("locked");
          return;
        }

        setAccess("allowed");
        const response = await fetch(`/api/company/${ticker}/pro-analysis`, {
          cache: "no-store",
        });

        if (!response.ok) {
          setAccess(response.status === 401 || response.status === 403 ? "locked" : "failed");
          return;
        }

        const data = (await response.json()) as Payload;
        if (!cancelled) setPayload(data);
      } catch {
        if (!cancelled) setAccess("failed");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (access === "failed") return null;

  if (access === "checking" || (access === "allowed" && !payload)) {
    return (
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 text-slate-300 sm:p-6">
        <p className="text-xs font-bold tracking-[0.24em] text-yellow-200">PRO ANALYSIS</p>
        <p className="mt-3 text-sm">Pro契約状態を確認中です。</p>
      </section>
    );
  }

  if (access === "locked") {
    return (
      <section className="mt-6 rounded-3xl border border-yellow-300/30 bg-gradient-to-br from-yellow-500/15 via-white/[0.04] to-green-500/10 p-5 sm:p-6">
        <p className="text-xs font-black tracking-[0.24em] text-yellow-200">PRO ONLY</p>
        <h2 className="mt-2 text-2xl font-black text-white">Pro専用分析</h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          成長の質・キャッシュ創出力・財務耐久力・前期からの変化・リスクの重なりはPro限定です。
        </p>
        <Link
          href="/pricing"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-yellow-400 px-6 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300"
        >
          初月100円で続きを見る
        </Link>
      </section>
    );
  }

  if (!payload) return null;

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-yellow-300/30 bg-gradient-to-br from-yellow-500/15 via-white/[0.04] to-green-500/10 p-[1px] shadow-2xl shadow-yellow-950/20">
      <div className="rounded-3xl bg-[#080b14]/92 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.24em] text-yellow-200">PRO ANALYSIS</p>
            <h2 className="mt-2 text-2xl font-black text-white">Pro専用分析</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              成長の質・キャッシュ創出力・財務耐久力・リスク深掘りをまとめて確認できます。
            </p>
          </div>
          <span className="w-fit rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-slate-950">Pro</span>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-sm font-black text-white">概要</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
            {payload.freePreview.map((item) => (
              <li key={item}>・{item}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          {payload.lockedInsights.map((item) => (
            <div key={item.title} className="rounded-2xl border border-yellow-300/20 bg-yellow-500/10 p-4">
              <p className="text-sm font-black text-yellow-100">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-6 text-slate-500">{payload.disclaimer}</p>
      </div>
    </section>
  );
}
