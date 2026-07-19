"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Company = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
};

function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

function normalize(value: string) {
  return toKatakana(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/株式会社|有限会社|合同会社|ホールディングス|グループ/g, "")
    .replace(/[‐‑‒–—―ーｰ・,，.．/／()（）\[\]【】「」『』'’`´\s　]/g, "");
}

function scoreCompany(company: Company, query: string) {
  const ticker = normalize(company.ticker);
  const name = normalize(company.company_name);

  if (ticker === query || name === query) return 1000;
  if (ticker.startsWith(query) || name.startsWith(query)) return 800;
  if (ticker.includes(query) || name.includes(query)) return 600;
  return 0;
}

export default function NewsSearch({
  companies,
  market,
  initialQuery,
}: {
  companies: Company[];
  market: "all" | "growth" | "standard" | "prime";
  initialQuery: string;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialQuery);

  const suggestions = useMemo(() => {
    const query = normalize(keyword);
    if (!query) return [];

    return companies
      .filter((company) => market === "all" || company.market_segment === market)
      .map((company) => ({ company, score: scoreCompany(company, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.company.ticker.localeCompare(b.company.ticker))
      .slice(0, 10)
      .map((item) => item.company);
  }, [companies, keyword, market]);

  function search(value = keyword) {
    const params = new URLSearchParams();
    if (market !== "all") params.set("market", market);
    if (value.trim()) params.set("q", value.trim());
    router.push(params.toString() ? `/news?${params.toString()}` : "/news");
  }

  return (
    <div className="relative mt-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search();
            }
          }}
          placeholder="会社名・証券コード・ニュース見出しで検索"
          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
        />
        <button
          type="button"
          onClick={() => search()}
          className="min-h-12 rounded-2xl bg-cyan-300 px-6 font-black text-slate-950 transition hover:bg-cyan-200"
        >
          検索
        </button>
      </div>

      {keyword.trim() && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#07111f] shadow-2xl">
          {suggestions.map((company) => (
            <button
              key={company.ticker}
              type="button"
              onClick={() => search(company.company_name)}
              className="flex w-full items-center justify-between gap-4 border-b border-white/5 px-5 py-4 text-left hover:bg-white/10"
            >
              <span className="font-black text-white">{company.company_name}</span>
              <span className="text-sm text-slate-500">{company.ticker}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
