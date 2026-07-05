"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type HistoryRow = {
  year?: string | number;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  operatingCF?: number;
};

type Payload = {
  ticker: string;
  company_name: string;
  history: HistoryRow[];
};

function yenOku(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value / 100_000_000).toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}億円`;
}

function pct(current?: number, previous?: number) {
  if (
    typeof current !== "number" ||
    typeof previous !== "number" ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return "—";
  }

  const value = ((current - previous) / Math.abs(previous)) * 100;
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function toneClass(value: string) {
  if (value.startsWith("+")) return "text-green-300";
  if (value.startsWith("-")) return "text-red-300";
  return "text-slate-500";
}

export default function CompanyHistoryTable() {
  const pathname = usePathname();
  const ticker = useMemo(() => {
    const match = pathname?.match(/^\/company\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;

    fetch(`/api/company/${ticker}/history`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setPayload(json);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!ticker || !payload || payload.history.length === 0) return null;

  const rows = [...payload.history].sort(
    (a, b) => Number(b.year ?? 0) - Number(a.year ?? 0)
  );

  return (
    <section className="bg-[#050816] px-4 pb-10 text-white sm:px-8">
      <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.25em] text-cyan-300">FINANCIAL HISTORY</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              {payload.company_name} の財務推移表
            </h2>
          </div>
          <p className="text-xs leading-6 text-slate-500">
            単位は億円。成長率は直前期比です。
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead className="bg-black/30 text-left text-xs font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">年度</th>
                <th className="px-4 py-3 text-right">売上高</th>
                <th className="px-4 py-3 text-right">売上成長率</th>
                <th className="px-4 py-3 text-right">営業利益</th>
                <th className="px-4 py-3 text-right">純利益</th>
                <th className="px-4 py-3 text-right">営業CF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const previous = rows[index + 1];
                const revenueGrowth = pct(row.revenue, previous?.revenue);

                return (
                  <tr key={`${row.year}-${index}`} className="border-t border-white/10 odd:bg-white/[0.03]">
                    <td className="px-4 py-3 font-black text-white">{row.year ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-100">{yenOku(row.revenue)}</td>
                    <td className={`px-4 py-3 text-right font-black ${toneClass(revenueGrowth)}`}>{revenueGrowth}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-100">{yenOku(row.operatingIncome)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-100">{yenOku(row.netIncome)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-100">{yenOku(row.operatingCF)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-6 text-slate-500">
          EDINETから取得できた履歴データを表示しています。会社によって取得できる年度・項目数は異なります。
        </p>
      </div>
    </section>
  );
}
