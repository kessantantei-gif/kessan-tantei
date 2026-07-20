"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import CompanySearch from "@/components/company-search";

type SearchCompany = {
  ticker: string;
  company_name: string;
  score: number;
  danger_score: number;
  market_segment?: string | null;
};

type SearchResponse = {
  companies?: SearchCompany[];
  error?: string;
};

export default function GlobalCompanySearch() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const [companies, setCompanies] = useState<SearchCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  async function loadCompanies() {
    if (companies.length > 0 || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/company-search", {
        cache: "force-cache",
      });
      const payload = (await response.json()) as SearchResponse;

      if (!response.ok) {
        throw new Error(payload.error || "企業検索データを取得できませんでした。");
      }

      setCompanies(payload.companies ?? []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "企業検索データを取得できませんでした。"
      );
    } finally {
      setLoading(false);
    }
  }

  function openSearch() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    void loadCompanies();
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={openSearch}
        className="flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border border-green-400/35 bg-green-500/10 px-3 py-2 text-[11px] font-black text-green-200 transition hover:border-green-300/70 hover:bg-green-500/20 active:scale-95 sm:min-h-11 sm:px-4 sm:text-sm"
        aria-haspopup="dialog"
      >
        <span className="sm:hidden">検索</span>
        <span className="hidden sm:inline">全市場から検索</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="global-company-search-title"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto w-[min(760px,calc(100vw-24px))] overflow-visible rounded-3xl border border-white/15 bg-[#07111f] p-0 text-white shadow-2xl shadow-black/60 backdrop:bg-black/75"
      >
        <div className="rounded-3xl bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_35%),#07111f] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.25em] text-green-300">
                ALL MARKETS SEARCH
              </p>
              <h2
                id="global-company-search-title"
                className="mt-2 text-2xl font-black sm:text-3xl"
              >
                全市場の企業を検索
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                プライム・スタンダード・グロースを、会社名または証券コードから検索できます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="検索画面を閉じる"
            >
              ×
            </button>
          </div>

          <div className="mt-6">
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                全市場の企業データを読み込んでいます。
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-5">
                <p className="text-sm font-bold text-red-100">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadCompanies()}
                  className="mt-4 rounded-full border border-red-300/30 px-4 py-2 text-sm font-bold text-red-100 hover:bg-red-500/10"
                >
                  再読み込み
                </button>
              </div>
            ) : (
              <CompanySearch companies={companies} />
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
