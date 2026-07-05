"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Company = {
  ticker: string;
  company_name: string;
  score: number;
  danger_score: number;
};

const ALIASES: Record<string, string[]> = {
  "4478": ["フリー", "freee"],
  "4165": ["プレイド", "plaid"],
  "2158": ["fronteo", "フロンテオ", "フロンテオー"],
  "3697": ["shift", "シフト"],
  "3993": ["pksha", "パークシャ", "パークシャテクノロジー"],
  "4480": ["メドレー", "medley"],
  "4493": ["サイバーセキュリティクラウド", "サイバー", "サイセキュ"],
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

const SEARCH_TIPS = [
  "証券コード4桁",
  "会社名の一部",
  "カタカナ表記",
  "英字表記",
];

function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

function normalizeCorporateWord(value: string) {
  return toKatakana(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‐‑‒–—―ーｰ]/g, "")
    .replace(/[・,，.．/／()（）\[\]【】「」『』'’`´\s　]/g, "");
}

function normalize(value: string) {
  let normalized = toKatakana(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[＆]/g, "&")
    .replace(/[‐‑‒–—―ーｰ]/g, "")
    .replace(/[・,，.．/／()（）\[\]【】「」『』'’`´\s　]/g, "");

  for (const word of CORPORATE_WORDS) {
    normalized = normalized.replaceAll(normalizeCorporateWord(word), "");
  }

  return normalized;
}

function compactTicker(value: string) {
  return value.replace(/[^0-9]/g, "");
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

function getAliases(company: Company) {
  const aliases = ALIASES[company.ticker] ?? [];
  const name = company.company_name;

  return [
    company.ticker,
    name,
    name.replace(/^株式会社/, ""),
    name.replace(/株式会社$/, ""),
    name.replace(/ホールディングス/g, "HD"),
    name.replace(/ホールディングス/g, ""),
    name.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    ),
    ...aliases,
  ].filter(Boolean);
}

function getSearchText(company: Company) {
  return getAliases(company).map(normalize).join(" ");
}

function scoreMatch(company: Company, query: string) {
  const normalizedTicker = normalize(company.ticker);
  const tickerDigits = compactTicker(query);
  const aliases = getAliases(company).map(normalize);
  const searchText = aliases.join(" ");

  if (!query) return 0;
  if (tickerDigits && normalizedTicker.startsWith(tickerDigits)) return 1000;
  if (aliases.some((alias) => alias === query)) return 900;
  if (aliases.some((alias) => alias.startsWith(query))) return 800;
  if (searchText.includes(query)) return 700;
  if (query.length >= 2 && aliases.some((alias) => isSubsequence(query, alias))) return 500;

  return 0;
}

function SearchHintPanel({ examples }: { examples: Company[] }) {
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-400">
      <div className="flex flex-wrap gap-2">
        {SEARCH_TIPS.map((tip) => (
          <span key={tip} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
            {tip}
          </span>
        ))}
      </div>
      {examples.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs font-bold text-slate-500">例：</span>
          {examples.map((company) => (
            <button
              key={company.ticker}
              type="button"
              className="rounded-full border border-green-400/20 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-200 transition hover:bg-green-500/20"
              onClick={() => undefined}
              aria-hidden="true"
            >
              {company.company_name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CompanySearch({ companies }: { companies: Company[] }) {
  const [keyword, setKeyword] = useState("");

  const exampleCompanies = useMemo(
    () => [...companies].sort((a, b) => b.score - a.score).slice(0, 4),
    [companies]
  );

  const results = useMemo(() => {
    const q = normalize(keyword);
    if (!q) return [];

    return companies
      .map((company) => ({
        company,
        score: scoreMatch(company, q),
        searchText: getSearchText(company),
      }))
      .filter(({ score, searchText }) => score > 0 || searchText.includes(q))
      .sort((a, b) => b.score - a.score || b.company.score - a.company.score)
      .slice(0, 12)
      .map(({ company }) => company);
  }, [keyword, companies]);

  return (
    <div className="relative w-full">
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="銘柄名・コードで検索 例：ベルトラ / 7048 / freee"
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-slate-500 focus:border-green-400/60"
      />

      {!keyword.trim() ? <SearchHintPanel examples={exampleCompanies} /> : null}

      {keyword.trim() ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#07111f] shadow-2xl">
          {results.length === 0 ? (
            <div className="px-5 py-4 text-sm leading-7 text-slate-400">
              <p className="font-bold text-white">該当する銘柄がありません。</p>
              <p className="mt-1">会社名の一部・カタカナ・英字・証券コード4桁で検索してください。</p>
            </div>
          ) : (
            results.map((company) => (
              <Link
                key={company.ticker}
                href={`/company/${company.ticker}`}
                className="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-4 hover:bg-white/10"
              >
                <div>
                  <p className="font-black">{company.company_name}</p>
                  <p className="text-sm text-slate-500">{company.ticker}</p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-500">Score</p>
                  <p className="font-black text-green-300">{company.score}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
