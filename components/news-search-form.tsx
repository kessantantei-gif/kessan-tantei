"use client";

import { useMemo, useState } from "react";

type MarketSlug = "all" | "growth" | "standard" | "prime";

type Company = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
};

const CORPORATE_WORDS = [
  "株式会社",
  "有限会社",
  "合同会社",
  "ホールディングス",
  "グループ",
  "incorporated",
  "corporation",
  "holdings",
  "group",
  "inc",
  "corp",
  "co",
  "ltd",
];

function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

function normalize(value: string) {
  let normalized = toKatakana(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[＆]/g, "&")
    .replace(/[‐‑‒–—―ーｰ]/g, "")
    .replace(/[・,，.．/／()（）\[\]【】「」『』'’`´\s　]/g, "");

  for (const word of CORPORATE_WORDS) {
    const normalizedWord = toKatakana(word)
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[‐‑‒–—―ーｰ]/g, "")
      .replace(/[・,，.．/／()（）\[\]【】「」『』'’`´\s　]/g, "");
    normalized = normalized.replaceAll(normalizedWord, "");
  }

  return normalized;
}

function isSubsequence(query: string, target: string) {
  if (!query) return true;
  let index = 0;
  for (const char of target) {
    if (char === query[index]) index += 1;
    if (index === query.length) return true;
  }
  return false;
}

function matchScore(company: Company, query: string) {
  const ticker = normalize(company.ticker);
  const name = normalize(company.company_name);
  if (!query) return 0;
  if (ticker === query || name === query) return 1000;
  if (ticker.startsWith(query) || name.startsWith(query)) return 900;
  if (ticker.includes(query) || name.includes(query)) return 800;
  if (query.length >= 2 && isSubsequence(query, name)) return 500;
  return 0;
}

const marketLabels: Record<string, string> = {
  growth: "グロース",
  standard: "スタンダード",
  prime: "プライム",
};

export default function NewsSearchForm({
  companies,
  market,
  initialQuery,
}: {
  companies: Company[];
  market: MarketSlug;
  initialQuery: string;
}) {
  const [keyword, setKeyword] = useState(initialQuery);
  const normalizedQuery = normalize(keyword);

  const suggestions = useMemo(() => {
    if (!normalizedQuery) return [];
    return companies
      .filter((company) => market === "all" || company.market_segment === market)
      .map((company) => ({ company, score: matchScore(company, normalizedQuery) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.company.ticker.localeCompare(b.company.ticker))
      .slice(0, 10)
      .map((item) => item.company);
  }, [companies, market, normalizedQuery]);

  return (
    <form action="/news" method="get" className="relative mt-5">
      {market !== "all" ? <input type="hidden" name="market" value={market} /> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          name="q"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          autoComplete="off"
          placeholder="会社名・証券コード・ニュース見出しで検索"
          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
        />
        <button
          type="submit"
          className="min-h-12 rounded-2xl bg-cyan-300 px-6 font-black text-slate-950 transition hover:bg-cyan-200"
        >
          検索
        </button>
      </div>

      {keyword.trim() && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#07111f] shadow-2xl sm:right-[92px]">
          {suggestions.map((company) => (
            <button
              key={company.ticker}
              type="button"
              onClick={() => setKeyword(company.company_name)}
              className="flex w-full items-center justify-between gap-4 border-b border-white/5 px-5 py-4 text-left hover:bg-white/10"
            >
              <span>
                <span className="block font-black text-white">{company.company_name}</span>
                <span className="mt-1 block text-xs text-slate-500">{company.ticker}</span>
              </span>
              <span className="text-xs font-bold text-cyan-200">
                {marketLabels[company.market_segment ?? ""] ?? "市場未登録"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
