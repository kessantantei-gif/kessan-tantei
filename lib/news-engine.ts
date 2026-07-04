import { supabaseAdmin } from "@/lib/supabase";
import { isBlockedNews } from "@/lib/news-filter";

type NewsItem = {
  id: string;
  ticker: string | null;
  title: string;
  summary: string | null;
  url: string;
  source: string | null;
  published_at: string | null;
};

type CommentLike = {
  body: string;
};

export async function getCompanyNews(ticker: string, limit = 5) {
  const { data } = await supabaseAdmin
    .from("growth_news")
    .select("id, ticker, title, summary, url, source, published_at")
    .eq("ticker", ticker)
    .order("published_at", { ascending: false })
    .limit(limit * 5);

  return ((data ?? []) as NewsItem[])
    .filter((item) => !isBlockedNews(item))
    .slice(0, limit);
}

export function summarizeComments(comments: CommentLike[]) {
  const bodies = comments
    .map((comment) => comment.body)
    .filter(Boolean)
    .join("\n");

  if (!bodies.trim()) {
    return "掲示板コメントはまだ少ないため、要約はありません。";
  }

  const positiveWords = ["期待", "強い", "成長", "黒字", "買い", "良い", "上方"];
  const negativeWords = ["危険", "赤字", "不安", "希薄化", "売り", "悪い", "下方"];

  const positiveCount = positiveWords.reduce(
    (sum, word) => sum + (bodies.includes(word) ? 1 : 0),
    0
  );

  const negativeCount = negativeWords.reduce(
    (sum, word) => sum + (bodies.includes(word) ? 1 : 0),
    0
  );

  if (positiveCount > negativeCount) {
    return "掲示板では、成長期待や業績改善に関する前向きなコメントが目立ちます。";
  }

  if (negativeCount > positiveCount) {
    return "掲示板では、赤字・希薄化・業績不安などに関する慎重なコメントが目立ちます。";
  }

  return "掲示板では、強気・弱気の見方が分かれており、投資家の評価はまだ定まっていないようです。";
}