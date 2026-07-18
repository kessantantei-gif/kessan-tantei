import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isBlockedNews } from "@/lib/news-filter";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "上場企業ニュース | 決算探偵",
  description:
    "グロース・スタンダード・プライム市場の上場企業ニュースを、会社名・証券コード・市場別に検索できます。",
  alternates: { canonical: "/news" },
};

type MarketSlug = "all" | "growth" | "standard" | "prime";

type NewsItem = {
  id: string;
  ticker: string | null;
  title: string;
  summary: string | null;
  url: string;
  source: string | null;
  published_at: string | null;
  created_at: string | null;
};

type CompanyMaster = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
};

type EnrichedNewsItem = NewsItem & {
  companyName: string;
  marketSegment: string;
};

type PageProps = {
  searchParams: Promise<{
    market?: string;
    q?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 30;

const marketLabels: Record<string, string> = {
  growth: "グロース",
  standard: "スタンダード",
  prime: "プライム",
  other: "その他",
};

const marketClasses: Record<string, string> = {
  growth: "border-green-400/30 bg-green-500/10 text-green-200",
  standard: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  prime: "border-violet-400/30 bg-violet-500/10 text-violet-200",
  other: "border-white/10 bg-white/5 text-slate-300",
};

function normalizeMarket(value?: string): MarketSlug {
  if (value === "growth" || value === "standard" || value === "prime") return value;
  return "all";
}

function formatNewsDate(value?: string | null) {
  if (!value) return "日付不明";

  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildNewsHref({
  market,
  query,
  page,
}: {
  market: MarketSlug;
  query: string;
  page: number;
}) {
  const params = new URLSearchParams();
  if (market !== "all") params.set("market", market);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/news?${suffix}` : "/news";
}

async function loadNewsData() {
  const [news, companies] = await Promise.all([
    loadAllSupabaseRows<NewsItem>(
      "ニュース一覧取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("growth_news")
          .select("id, ticker, title, summary, url, source, published_at, created_at")
          .not("url", "is", null)
          .order("published_at", { ascending: false, nullsFirst: false })
          .range(from, to)
    ),
    loadAllSupabaseRows<CompanyMaster>(
      "会社マスタ取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select("ticker, company_name, market_segment")
          .eq("listing_status", "listed")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
  ]);

  const companyMap = new Map(companies.map((company) => [company.ticker, company]));

  return news
    .filter((item) => !isBlockedNews(item))
    .map((item): EnrichedNewsItem => {
      const company = item.ticker ? companyMap.get(item.ticker) : null;
      return {
        ...item,
        companyName: company?.company_name ?? "会社名未登録",
        marketSegment: company?.market_segment ?? "other",
      };
    });
}

export default async function NewsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedMarket = normalizeMarket(params.market);
  const query = (params.q ?? "").trim();
  const requestedPage = Math.max(1, Number(params.page ?? 1) || 1);

  let loadError = "";
  let allNews: EnrichedNewsItem[] = [];

  try {
    allNews = await loadNewsData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "ニュース取得でエラーが発生しました。";
  }

  const normalizedQuery = query.toLowerCase();
  const filteredNews = allNews.filter((item) => {
    if (selectedMarket !== "all" && item.marketSegment !== selectedMarket) return false;
    if (!normalizedQuery) return true;

    return [item.ticker, item.companyName, item.title, item.summary, item.source]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });

  const totalPages = Math.max(1, Math.ceil(filteredNews.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleNews = filteredNews.slice(pageStart, pageStart + PAGE_SIZE);

  const marketCounts = {
    all: allNews.length,
    growth: allNews.filter((item) => item.marketSegment === "growth").length,
    standard: allNews.filter((item) => item.marketSegment === "standard").length,
    prime: allNews.filter((item) => item.marketSegment === "prime").length,
  };

  const firstVisible = filteredNews.length === 0 ? 0 : pageStart + 1;
  const lastVisible = Math.min(pageStart + PAGE_SIZE, filteredNews.length);

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.14),transparent_32%),radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),transparent_28%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.14),transparent_35%)]" />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-6 backdrop-blur-xl sm:p-9">
          <p className="text-xs font-black tracking-[0.3em] text-cyan-300">ALL MARKET NEWS</p>
          <h1 className="mt-4 text-3xl font-black sm:text-5xl">上場企業ニュース</h1>
          <p className="mt-4 max-w-4xl leading-8 text-slate-300">
            グロース・スタンダード・プライム市場の企業ニュースを自動収集しています。
            会社名、証券コード、市場で絞り込み、各社の決算・開示・IR関連ニュースを確認できます。
          </p>
          <p className="mt-4 text-sm font-bold text-cyan-100">
            保存済みニュース：{allNews.length.toLocaleString("ja-JP")}件
          </p>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["all", "全市場"],
                ["growth", "グロース"],
                ["standard", "スタンダード"],
                ["prime", "プライム"],
              ] as const
            ).map(([slug, label]) => (
              <Link
                key={slug}
                href={buildNewsHref({ market: slug, query, page: 1 })}
                className={`rounded-2xl border px-4 py-4 transition ${
                  selectedMarket === slug
                    ? "border-cyan-300/60 bg-cyan-400/15 text-white"
                    : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/10"
                }`}
              >
                <p className="font-black">{label}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {marketCounts[slug].toLocaleString("ja-JP")}件
                </p>
              </Link>
            ))}
          </div>

          <form action="/news" method="get" className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            {selectedMarket !== "all" ? (
              <input type="hidden" name="market" value={selectedMarket} />
            ) : null}
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="会社名・証券コード・ニュース見出しで検索"
              className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
            />
            <button
              type="submit"
              className="min-h-12 rounded-2xl bg-cyan-300 px-6 font-black text-slate-950 transition hover:bg-cyan-200"
            >
              検索
            </button>
          </form>

          {query ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span>「{query}」の検索結果</span>
              <Link
                href={buildNewsHref({ market: selectedMarket, query: "", page: 1 })}
                className="font-bold text-cyan-200 hover:text-cyan-100"
              >
                検索を解除
              </Link>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <p>
            {filteredNews.length.toLocaleString("ja-JP")}件中 {firstVisible.toLocaleString("ja-JP")}〜
            {lastVisible.toLocaleString("ja-JP")}件を表示
          </p>
          <p>
            {currentPage} / {totalPages}ページ
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {loadError ? (
            <p className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-red-300">
              ニュース取得でエラーが発生しました。{loadError}
            </p>
          ) : visibleNews.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-400">
              条件に一致するニュースはありません。
            </p>
          ) : (
            visibleNews.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-400/40 hover:bg-white/[0.07]"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-full border px-3 py-1 font-black ${
                      marketClasses[item.marketSegment] ?? marketClasses.other
                    }`}
                  >
                    {marketLabels[item.marketSegment] ?? marketLabels.other}
                  </span>
                  {item.ticker ? (
                    <Link
                      href={`/company/${item.ticker}`}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-bold text-slate-300 hover:text-white"
                    >
                      {item.companyName}（{item.ticker}）
                    </Link>
                  ) : null}
                  <span className="text-slate-500">{formatNewsDate(item.published_at)}</span>
                </div>

                <a href={item.url} target="_blank" rel="noreferrer" className="group block">
                  <h2 className="mt-3 text-lg font-black leading-8 group-hover:text-cyan-200 sm:text-xl">
                    {item.title}
                  </h2>
                  {item.summary && item.summary !== item.title ? (
                    <p className="mt-3 leading-7 text-slate-300">{item.summary}</p>
                  ) : null}
                  <p className="mt-3 text-sm text-slate-500">
                    {item.source || "Google News"}　<span className="text-cyan-300">記事を開く →</span>
                  </p>
                </a>
              </article>
            ))
          )}
        </div>

        {totalPages > 1 ? (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="ニュースページ切替">
            {currentPage > 1 ? (
              <Link
                href={buildNewsHref({ market: selectedMarket, query, page: currentPage - 1 })}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 font-black text-slate-200 hover:bg-white/10"
              >
                ← 前へ
              </Link>
            ) : (
              <span className="rounded-full border border-white/5 px-5 py-3 text-slate-600">← 前へ</span>
            )}

            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-5 py-3 font-black text-cyan-100">
              {currentPage} / {totalPages}
            </span>

            {currentPage < totalPages ? (
              <Link
                href={buildNewsHref({ market: selectedMarket, query, page: currentPage + 1 })}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 font-black text-slate-200 hover:bg-white/10"
              >
                次へ →
              </Link>
            ) : (
              <span className="rounded-full border border-white/5 px-5 py-3 text-slate-600">次へ →</span>
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
