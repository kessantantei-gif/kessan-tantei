import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isBlockedNews } from "@/lib/news-filter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default async function NewsPage() {
  const { data, error } = await supabaseAdmin
    .from("growth_news")
    .select("id, ticker, title, summary, url, source, published_at, created_at")
    .not("url", "is", null)
    .order("published_at", { ascending: false })
    .limit(200);

  const news = ((data ?? []) as NewsItem[]).filter(
    (item) => !isBlockedNews(item)
  );

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_bottom,_rgba(168,85,247,0.12),transparent_35%)]" />

      <header className="relative z-10 border-b border-white/10 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
          <Link href="/" className="text-2xl font-black sm:text-3xl">
            決算探偵
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            ← ホームへ
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5 backdrop-blur-xl sm:p-8">
          <p className="text-xs tracking-[0.3em] text-cyan-300">
            GROWTH NEWS
          </p>
          <h1 className="mt-4 text-3xl font-black sm:text-5xl">
            グロースニュース
          </h1>
          <p className="mt-4 leading-8 text-slate-300">
            グロース市場企業に関連するニュースを自動収集しています。
            Yahoo!ファイナンス・掲示板系・有料会員限定ページは除外しています。
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {error ? (
            <p className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-red-300">
              ニュース取得でエラーが発生しました。
            </p>
          ) : news.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-400">
              表示できるニュースがまだありません。
            </p>
          ) : (
            news.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-400/40 hover:bg-white/10"
              >
                <p className="text-lg font-black leading-8">{item.title}</p>

                <div className="mt-2 text-sm text-slate-400">
                  <p>
                    {item.source || "Google News"}
                    {item.ticker ? ` / ${item.ticker}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    発行日: {formatNewsDate(item.published_at)}
                  </p>
                </div>

                {item.summary ? (
                  <p className="mt-3 leading-7 text-slate-300">
                    {item.summary}
                  </p>
                ) : null}
              </a>
            ))
          )}
        </div>
      </section>
    </main>
  );
}