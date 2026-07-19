"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Company = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
};

const MARKET_LABELS: Record<string, string> = {
  growth: "グロース",
  standard: "スタンダード",
  prime: "プライム",
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

function normalizeBasic(value: string) {
  return toKatakana(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[＆]/g, "&")
    .replace(/[‐‑‒–—―ーｰ]/g, "")
    .replace(/[・,，.．/／()（）\[\]【】「」『』'’`´\s　]/g, "");
}

function normalize(value: string) {
  let normalized = normalizeBasic(value);

  for (const word of CORPORATE_WORDS) {
    normalized = normalized.replaceAll(normalizeBasic(word), "");
  }

  return normalized;
}

function compactTicker(value: string) {
  return value.normalize("NFKC").replace(/[^0-9]/g, "");
}

function isSubsequence(query: string, target: string) {
  if (!query) return true;

  let queryIndex = 0;
  for (const character of target) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }

  return false;
}

function companyAliases(company: Company) {
  const name = company.company_name;

  return [
    company.ticker,
    name,
    name.replace(/^株式会社/, ""),
    name.replace(/株式会社$/, ""),
    name.replace(/ホールディングス/g, "HD"),
    name.replace(/ホールディングス/g, ""),
    name.replace(/グループ/g, ""),
  ]
    .filter(Boolean)
    .map(normalize);
}

function matchScore(company: Company, query: string, tickerQuery: string) {
  const aliases = companyAliases(company);
  const ticker = compactTicker(company.ticker);

  if (tickerQuery && ticker === tickerQuery) return 1200;
  if (tickerQuery && ticker.startsWith(tickerQuery)) return 1100;
  if (aliases.some((alias) => alias === query)) return 1000;
  if (aliases.some((alias) => alias.startsWith(query))) return 900;
  if (aliases.some((alias) => alias.includes(query))) return 800;
  if (query.length >= 2 && aliases.some((alias) => isSubsequence(query, alias))) return 500;

  return 0;
}

export default function AllMarketCompanySearch({
  companies,
}: {
  companies: Company[];
}) {
  const [keyword, setKeyword] = useState("");
  const normalizedKeyword = normalize(keyword);
  const tickerKeyword = compactTicker(keyword);

  const results = useMemo(() => {
    if (!normalizedKeyword && !tickerKeyword) return [];

    return companies
      .map((company) => ({
        company,
        score: matchScore(company, normalizedKeyword, tickerKeyword),
      }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.company.company_name.localeCompare(b.company.company_name, "ja")
      )
      .slice(0, 12)
      .map((item) => item.company);
  }, [companies, normalizedKeyword, tickerKeyword]);

  const hasKeyword = keyword.trim().length > 0;

  return (
    <div className="relative mt-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="会社名・証券コードを入力（ひらがなでも検索できます）"
          autoComplete="off"
          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
        />
        <button
          type="button"
          onClick={() => setKeyword("")}
          disabled={!hasKeyword}
          className="min-h-12 rounded-2xl bg-cyan-300 px-6 font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          クリア
        </button>
      </div>

      {hasKeyword ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#07111f] shadow-2xl">
          {results.length === 0 ? (
            <div className="px-5 py-5 text-sm leading-7 text-slate-400">
              <p className="font-bold text-white">一致する上場会社がありません。</p>
              <p className="mt-1">会社名の一部、ひらがな、カタカナ、英字、証券コードで検索できます。</p>
            </div>
          ) : (
            results.map((company) => (
              <Link
                key={company.ticker}
                href={`/company/${company.ticker}`}
                className="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-4 transition last:border-b-0 hover:bg-white/10"
              >
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{company.company_name}</p>
                  <p className="mt-1 text-sm text-slate-500">{company.ticker}</p>
                </div>
                <span className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-200">
                  {MARKET_LABELS[company.market_segment ?? ""] ?? "市場未登録"}
                </span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
