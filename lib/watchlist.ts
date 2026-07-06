export const WATCHLIST_STORAGE_KEY = "kessan-tantei-watchlist";

export type WatchlistItem = {
  ticker: string;
  name: string;
  addedAt: string;
};

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
}

export function readWatchlist(): WatchlistItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistItem[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item?.ticker && item?.name)
      .map((item) => ({
        ticker: normalizeTicker(item.ticker),
        name: item.name,
        addedAt: item.addedAt || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export function writeWatchlist(items: WatchlistItem[]) {
  if (typeof window === "undefined") return;

  const unique = new Map<string, WatchlistItem>();
  for (const item of items) {
    unique.set(normalizeTicker(item.ticker), {
      ticker: normalizeTicker(item.ticker),
      name: item.name,
      addedAt: item.addedAt || new Date().toISOString(),
    });
  }

  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([...unique.values()]));
  window.dispatchEvent(new Event("kessan-watchlist-updated"));
}

export function addWatchlistItem(ticker: string, name: string) {
  const normalizedTicker = normalizeTicker(ticker);
  const current = readWatchlist();
  const exists = current.some((item) => item.ticker === normalizedTicker);
  if (exists) return current;

  const next = [
    ...current,
    {
      ticker: normalizedTicker,
      name,
      addedAt: new Date().toISOString(),
    },
  ];
  writeWatchlist(next);
  return next;
}

export function removeWatchlistItem(ticker: string) {
  const normalizedTicker = normalizeTicker(ticker);
  const next = readWatchlist().filter((item) => item.ticker !== normalizedTicker);
  writeWatchlist(next);
  return next;
}

export function isWatchlisted(ticker: string) {
  const normalizedTicker = normalizeTicker(ticker);
  return readWatchlist().some((item) => item.ticker === normalizedTicker);
}
