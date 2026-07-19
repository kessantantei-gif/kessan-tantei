import type { Metadata } from "next";
import Link from "next/link";
import NewsSearchForm from "@/components/news-search-form";
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

function safeSearchTerm(value: string) {
  return value.replace(/[,%()"']/g, " ").trim();
}

async function loadMarketTickers(market: MarketSlug) {
  if (market === "all") return null;

  const { data, error } = await supabaseAdmin
    .from("all_market_companies")
    .select("ticker")
    .eq("listing_status", "listed")
    .eq("market_segment", market)
    .order("ticker", { ascending: true });

  if (error) throw new Error(`市場企業取得失敗: ${error.message}`);
  return (data ?? []).map((row) => row.ticker as string);
}

async function loadListedCompanies() {
  return loadAllSupabaseRows<CompanyMaster>(
    "ニュース検索会社マスタ取得失敗",
    (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("ticker, company_name, market_segment")
        .eq("listing_status", "listed")
        .in("market_segment", ["growth", "standard", "prime"])
        .order("ticker", { ascending: true })
        .range(from, to)
  );
}

function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

function normalizeCompanySearch(value: string) {
  return toKatakana(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‐‑‒–—―ーｰ]/g, "")
    .replace(/[・,，.．/／()（）\[\]【】「」『』'’`´\s　]/g, "")
    .replace(/株式会社|有限会社|合同会社|ホールディングス|グループ/g, "");
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

function companyMatches(company: CompanyMaster, query: string) {
  const normalizedQuery = normalizeCompanySearch(query);
  if (!normalizedQuery) return false;
  const ticker = normalizeCompanySearch(company.ticker);
  const name = normalizeCompanySearch(company.company_name);
  return (
    ticker.includes(normalizedQuery) ||
    name.includes(normalizedQuery) ||
    (normalizedQuery.length >= 2 && isSubsequence(normalizedQuery, name))
  );
}

async function loadCompanySearchTickers(
  query: string,
  market: MarketSlug,
  companies: CompanyMaster[]
) {
  if (!query) return null;
  const tickers = companies
    .filter((company) => market === "all" || company.market_segment === market)
    .filter((company) => companyMatches(company, query))
    .map((company) => company.ticker);
  return tickers.length > 0 ? tickers : null;
}

async function loadNewsPage({
  marketTickers,
  companySearchTickers,
  query,
  page,
}: {
  marketTickers: string[] | null;
  companySearchTickers: string[] | null;
  query: string;
  page: number;
}) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let newsQuery = supabaseAdmin
    .from("growth_news")
    .select("id, ticker, title, summary, url, source, published_at, created_at", {
      count: "exact",
    })
    .not("url", "is", null);

  if (companySearchTickers) {
    newsQuery = newsQuery.in("ticker", companySearchTickers);
  } else if (marketTickers) {
    newsQuery = newsQuery.in("ticker", marketTickers);
  }

  if (query && !companySearchTickers) {
    const term = safeSearchTerm(query);
    if (term) {
      newsQuery = newsQuery.or(
        `ticker.ilike.%${term}%,title.ilike.%${term}%,summary.ilike.%${term}%,source.ilike.%${term}%`
      );
    }
  }

  const { data, error, count } = await newsQuery
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) throw new Error(`ニュース一覧取得失敗: ${error.message}`);

  return {
    rows: ((data ?? []) as NewsItem[]).filter((item) => !isBlockedNews(item)),
    count: count ?? 0,
  };
}

async function enrichNews(rows: NewsItem[]): Promise<EnrichedNewsItem[]> {
  const tickers = Array.from(
    new Set(rows.map((item) => item.ticker).filter((ticker): ticker is string => Boolean(ticker)))
  );

  if (tickers.length === 0) {
    return rows.map((item) => ({
      ...item,
      companyName: "会社名未登録",
      marketSegment: "other",
    }));
  }

  const { data, error } = await supabaseAdmin
    .from("all_market_companies")
    .select("ticker, company_name, market_segment")
    .in("ticker", tickers);

  if (error) throw new Error(`会社情報取得失敗: ${error.message}`);

  const companyMap = new Map(
    ((data ?? []) as CompanyMaster[]).map((company) => [company.ticker, company])
  );

  return rows.map((item) => {
    const company = item.ticker ? companyMap.get(item.ticker) : null;
    return {
      ...item,
      companyName: company?.company_name ?? "会社名未登録",
      marketSegment: company?.market_segment ?? "other",
    };
  });
}

async function loadTotalNewsCount() {
  const { count, error } = await supabaseAdmin
    .from("growth_news")
    .select("id", { count: "exact", head: true })
    .not("url", "is", null);

  if (error) return 0;
  return count ?? 0;
}

export default async function NewsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedMarket = normalizeMarket(params.market);
  const query = (params.q ?? "").trim();
  const requestedPage = Math.max(1, Number(params.page ?? 1) || 1);

  let loadError = "";
  let visibleNews: EnrichedNewsItem[] = [];
  let resultCount = 0;
  let currentPage = requestedPage;
  let totalNewsCount = 0;
  let listedCompanies: CompanyMaster[] = [];

  try {
    const [marketTickers, loadedCompanies, totalCount] = await Promise.all([
      loadMarketTickers(selectedMarket),
      loadListedCompanies(),
      loadTotalNewsCount(),
    ]);
    listedCompanies = loadedCompanies;
    const companySearchTickers = await loadCompanySearchTickers(
      query,
      selectedMarket,
      listedCompanies
    );

    totalNewsCount = totalCount;

    let result = await loadNewsPage({
      marketTickers,
      companySearchTickers,
      query,
      page: requestedPage,
    });

    resultCount = result.count;
    const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));

    if (requestedPage > totalPages) {
      currentPage = totalPages;
      result = await loadNewsPage({
        marketTickers,
        companySearchTickers,
        query,
        page: currentPage,
      });
    }

    visibleNews = await enrichNews(result.rows);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "ニュース取得でエラーが発生しました。";
  }

  const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));
  const firstVisible = resultCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, resultCount);

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
            保存済みニュース：{totalNewsCount.toLocaleString("ja-JP")}件
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
                className={`rounded-2xl border px-4 py-4 font-black transition ${
                  selectedMarket === slug
                    ? "border-cyan-300/60 bg-cyan-400/15 text-white"
                    : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/10"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          <NewsSearchForm
            companies={listedCompanies}
            market={selectedMarket}
            initialQuery={query}
          />

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
            {resultCount.toLocaleString("ja-JP")}件中 {firstVisible.toLocaleString("ja-JP")}〜
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
                    {item.source || "Google News"}　
                    <span className="text-cyan-300">記事を開く →</span>
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
