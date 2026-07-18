import type { Metadata } from "next";
import Link from "next/link";
import MarketPortalCard from "@/components/market-portal-card";
import { marketList } from "@/lib/markets";
import { supabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "市場を選ぶ | 決算探偵",
  description:
    "グロース・スタンダード・プライムの市場別に、決算ランキングと財務分析を確認できます。",
  alternates: { canonical: "/markets" },
};

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

type CompanySearchResult = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
};

const marketLabels: Record<string, string> = {
  growth: "グロース",
  standard: "スタンダード",
  prime: "プライム",
};

const marketClasses: Record<string, string> = {
  growth: "border-green-400/30 bg-green-500/10 text-green-200",
  standard: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  prime: "border-violet-400/30 bg-violet-500/10 text-violet-200",
};

function sanitizeSearch(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

async function searchCompanies(query: string) {
  if (!query) return { companies: [] as CompanySearchResult[], total: 0, error: "" };

  const safeQuery = sanitizeSearch(query);
  if (!safeQuery) return { companies: [] as CompanySearchResult[], total: 0, error: "" };

  const { data, error, count } = await supabaseAdmin
    .from("all_market_companies")
    .select("ticker, company_name, market_segment", { count: "exact" })
    .eq("listing_status", "listed")
    .in("market_segment", ["growth", "standard", "prime"])
    .or(`ticker.ilike.%${safeQuery}%,company_name.ilike.%${safeQuery}%`)
    .order("ticker", { ascending: true })
    .limit(30);

  return {
    companies: (data ?? []) as CompanySearchResult[],
    total: count ?? 0,
    error: error?.message ?? "",
  };
}

export default async function MarketsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const searchResult = await searchCompanies(query);

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.14),transparent_30%),radial-gradient(circle_at_top_left,_rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.14),transparent_35%)]" />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-20">
        <div className="max-w-4xl">
          <p className="text-xs font-black tracking-[0.3em] text-cyan-300">MARKET SELECT</p>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-7xl">
            市場を選んで、
            <br />
            決算から企業を見抜く。
          </h1>
          <p className="mt-6 text-base leading-8 text-slate-300 sm:text-lg">
            決算探偵は、上場市場ごとに異なる企業特性を踏まえて、財務・成長・キャッシュ・リスクを分析します。
            同じ画面構成で比較しながら、市場ごとに最適化した評価基準を使用します。
          </p>
        </div>

        <section className="mt-10 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.25em] text-cyan-300">ALL MARKET SEARCH</p>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">全市場から会社を検索</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            グロース・スタンダード・プライムを横断して、会社名または証券コードで検索できます。
          </p>

          <form action="/markets" method="get" className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="会社名または証券コードを入力"
              className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60"
            />
            <button
              type="submit"
              className="min-h-12 rounded-2xl bg-cyan-300 px-6 font-black text-slate-950 transition hover:bg-cyan-200"
            >
              検索
            </button>
          </form>

          {query ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                <p>
                  「{query}」の検索結果：{searchResult.total.toLocaleString("ja-JP")}社
                </p>
                <Link href="/markets" className="font-bold text-cyan-200 hover:text-cyan-100">
                  検索を解除
                </Link>
              </div>

              {searchResult.error ? (
                <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-200">
                  会社検索でエラーが発生しました。
                </p>
              ) : searchResult.companies.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-slate-400">
                  条件に一致する会社はありません。
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {searchResult.companies.map((company) => {
                    const market = company.market_segment ?? "";
                    return (
                      <Link
                        key={company.ticker}
                        href={`/company/${company.ticker}`}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/40 hover:bg-white/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-black text-white">{company.company_name}</p>
                            <p className="mt-1 text-sm text-slate-400">{company.ticker}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${
                              marketClasses[market] ?? "border-white/10 bg-white/5 text-slate-300"
                            }`}
                          >
                            {marketLabels[market] ?? "市場不明"}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {searchResult.total > searchResult.companies.length ? (
                <p className="mt-4 text-xs text-slate-500">
                  表示は先頭30社です。会社名または証券コードを追加して絞り込んでください。
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {marketList.map((market) => (
            <MarketPortalCard key={market.slug} market={market} />
          ))}
        </div>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <h2 className="text-2xl font-black">共通アカウントで利用できます</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">
            ウォッチリスト、掲示板、Pro契約、アラート、管理画面は3市場で共通です。市場ごとに別サイトを運用せず、1つの決算探偵として管理します。
          </p>
        </section>
      </section>
    </main>
  );
}
