"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "kessan-tantei-compare";

type Props = {
  companies: { ticker: string; company_name: string }[];
};

function writeItems(items: { ticker: string; name: string }[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("kessan-compare-updated"));
}

export default function ComparePageActions({ companies }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tickers = useMemo(
    () =>
      (searchParams.get("tickers") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [searchParams]
  );

  function updateTickers(nextTickers: string[]) {
    const nextCompanies = companies
      .filter((company) => nextTickers.includes(company.ticker))
      .map((company) => ({ ticker: company.ticker, name: company.company_name }));

    writeItems(nextCompanies);

    if (nextTickers.length === 0) {
      router.push("/compare");
      return;
    }

    router.push(`/compare?tickers=${encodeURIComponent(nextTickers.join(","))}`);
  }

  if (companies.length === 0) return null;

  return (
    <div className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-cyan-100">比較リスト</p>
          <p className="mt-1 text-xs leading-6 text-slate-400">
            不要な銘柄はここで外せます。右上の比較ボタンにも反映されます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => updateTickers([])}
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-slate-300 hover:bg-white/10"
        >
          全部クリア
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {companies.map((company) => (
          <button
            key={company.ticker}
            type="button"
            onClick={() => updateTickers(tickers.filter((ticker) => ticker !== company.ticker))}
            className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-slate-100 hover:border-red-300/30 hover:bg-red-500/20"
          >
            {company.company_name} ×
          </button>
        ))}
      </div>
    </div>
  );
}
