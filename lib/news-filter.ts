export function isBlockedNews(item: {
  url?: string | null;
  title?: string | null;
  source?: string | null;
}) {
  const url = (item.url ?? "").toLowerCase();
  const title = item.title ?? "";
  const source = item.source ?? "";

  const blockedUrlPatterns = [
    "finance.yahoo.co.jp",
    "finance.yahoo.com",
    "yahoo.co.jp/finance",
    "textream.yahoo.co.jp",
    "minkabu.jp",
    "5ch.net",
    "2ch.sc",
    "bakusai.com",
  ];

  const blockedTextPatterns = [
    "掲示板",
    "株価予想",
    "みんなの評価",
    "口コミ",
    "有料会員",
    "会員限定",
    "ログイン",
  ];

  const isYahooFinance =
    source.includes("Yahoo!ファイナンス") ||
    title.includes("Yahoo!ファイナンス") ||
    url.includes("finance.yahoo.co.jp") ||
    url.includes("yahoo.co.jp/finance");

  const blockedByUrl = blockedUrlPatterns.some((pattern) =>
    url.includes(pattern)
  );

  const blockedByTitle = blockedTextPatterns.some((pattern) =>
    title.includes(pattern)
  );

  return isYahooFinance || blockedByUrl || blockedByTitle;
}