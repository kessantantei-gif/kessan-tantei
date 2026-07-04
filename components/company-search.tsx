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

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[・　]/g, "");
}

function getSearchText(company: Company) {
  const aliases = ALIASES[company.ticker] ?? [];

  return normalize(
    [
      company.ticker,
      company.company_name,
      company.company_name.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
        String.fromCharCode(s.charCodeAt(0) - 0xfee0)
      ),
      ...aliases,
    ].join(" ")
  );
}

export default function CompanySearch({ companies }: { companies: Company[] }) {
  const [keyword, setKeyword] = useState("");

  const results = useMemo(() => {
    const q = normalize(keyword);
    if (!q) return [];

    return companies
      .map((company) => ({
        company,
        searchText: getSearchText(company),
      }))
      .filter(({ searchText }) => searchText.includes(q))
      .slice(0, 10)
      .map(({ company }) => company);
  }, [keyword, companies]);

  return (
    <div className="relative w-full">
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="銘柄名・コードで検索 例：プレイド / 4165 / freee"
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-slate-500 focus:border-green-400/60"
      />

      {keyword.trim() ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#07111f] shadow-2xl">
          {results.length === 0 ? (
            <div className="px-5 py-4 text-sm text-slate-400">
              該当する銘柄がありません。
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