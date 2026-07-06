"use client";

import { useEffect, useState } from "react";

type ChangeItem = {
  label: string;
  change: number | null;
  direction: "up" | "down" | "flat" | "neutral";
  display: string;
};

type Payload = {
  ticker: string;
  companyName: string;
  enoughData: boolean;
  currentPeriod?: string;
  previousPeriod?: string;
  score?: number | null;
  dangerScore?: number | null;
  summary: string;
  improved?: string[];
  worsened?: string[];
  changes: ChangeItem[];
  watchPoint?: string;
  disclaimer: string;
};

type Props = {
  ticker: string;
};

function directionClass(direction: ChangeItem["direction"]) {
  if (direction === "up") return "border-green-300/20 bg-green-500/10 text-green-100";
  if (direction === "down") return "border-red-300/20 bg-red-500/10 text-red-100";
  if (direction === "flat") return "border-yellow-300/20 bg-yellow-500/10 text-yellow-100";
  return "border-white/10 bg-white/5 text-slate-200";
}

function directionLabel(direction: ChangeItem["direction"]) {
  if (direction === "up") return "改善";
  if (direction === "down") return "悪化";
  if (direction === "flat") return "横ばい";
  return "比較不可";
}

export default function CompanyEarningsFlash({ ticker }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/company/${ticker}/earnings-flash`, { cache: "no-store" })
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
        <p className="text-xs font-bold tracking-[0.24em] text-yellow-200">EARNINGS FLASH</p>
        <p className="mt-3 text-sm">決算速報を読み込み中です。</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-3xl border border-yellow-300/20 bg-gradient-to-br from-yellow-500/10 via-white/[0.04] to-orange-500/10 p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.24em] text-yellow-200">EARNINGS FLASH</p>
          <h2 className="mt-2 text-2xl font-black text-white">決算速報・前回比較</h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            {payload.currentPeriod && payload.previousPeriod
              ? `${payload.previousPeriod} → ${payload.currentPeriod} の変化を表示しています。`
              : "前期比較に必要なデータを確認しています。"}
          </p>
        </div>
        <span className="w-fit rounded-full border border-yellow-300/20 bg-yellow-300/10 px-3 py-1 text-xs font-bold text-yellow-100">
          自動比較
        </span>
      </div>

      <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-8 text-slate-100 sm:text-base">
        {payload.summary}
      </p>

      {payload.enoughData ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-green-300/20 bg-green-500/10 p-4">
              <p className="text-sm font-black text-green-100">改善した項目</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                {(payload.improved ?? []).length > 0 ? payload.improved?.join("、") : "大きな改善項目は限定的です。"}
              </p>
            </div>
            <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
              <p className="text-sm font-black text-red-100">悪化した項目</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                {(payload.worsened ?? []).length > 0 ? payload.worsened?.join("、") : "大きな悪化項目は限定的です。"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {payload.changes.map((item) => (
              <div key={item.label} className={`rounded-2xl border p-4 ${directionClass(item.direction)}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-black">{item.label}</p>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black">
                    {directionLabel(item.direction)}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-black">{item.display}</p>
              </div>
            ))}
          </div>

          {payload.watchPoint ? (
            <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4 text-sm leading-7 text-cyan-50">
              <span className="font-black">見るべきポイント：</span>{payload.watchPoint}
            </div>
          ) : null}
        </>
      ) : null}

      <p className="mt-4 text-xs leading-6 text-slate-500">{payload.disclaimer}</p>
    </section>
  );
}
