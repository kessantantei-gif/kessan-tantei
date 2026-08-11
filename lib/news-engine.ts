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

function normalizeNewsText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isUsableNews(item: NewsItem) {
  const title = normalizeNewsText(item.title);
  const summary = normalizeNewsText(item.summary);

  if (!/^https?:\/\//i.test(item.url)) return false;
  if (title.length < 8 && summary.length < 28) return false;
  if (/^(ニュース|記事|詳細|ザイン|お知らせ)$/u.test(title)) return false;

  return true;
}

export async function getCompanyNews(ticker: string, limit = 5) {
  const { data } = await supabaseAdmin
    .from("growth_news")
    .select("id, ticker, title, summary, url, source, published_at")
    .eq("ticker", ticker)
    .order("published_at", { ascending: false })
    .limit(limit * 5);

  return ((data ?? []) as NewsItem[])
    .filter((item) => !isBlockedNews(item))
    .filter(isUsableNews)
    .slice(0, limit);
}

function countTerms(text: string, terms: string[]) {
  return terms.reduce((total, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return total + (text.match(new RegExp(escaped, "g"))?.length ?? 0);
  }, 0);
}

export function summarizeComments(comments: CommentLike[]) {
  const bodies = comments
    .map((comment) => comment.body)
    .filter(Boolean)
    .join("\n");

  if (!bodies.trim()) {
    return "コメント傾向：データ不足";
  }

  const positiveWords = ["期待", "強い", "成長", "黒字", "買い", "良い", "上方"];
  const negativeWords = ["危険", "赤字", "不安", "希薄化", "売り", "悪い", "下方"];
  const positiveCount = countTerms(bodies, positiveWords);
  const negativeCount = countTerms(bodies, negativeWords);

  if (positiveCount > negativeCount) {
    return `コメント傾向：前向き語が優勢（前向き ${positiveCount} / 慎重 ${negativeCount}）`;
  }

  if (negativeCount > positiveCount) {
    return `コメント傾向：慎重語が優勢（前向き ${positiveCount} / 慎重 ${negativeCount}）`;
  }

  return `コメント傾向：拮抗（前向き ${positiveCount} / 慎重 ${negativeCount}）`;
}
