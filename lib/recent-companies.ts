export const RECENT_COMPANIES_STORAGE_KEY = "kessan-tantei-recent-companies";

export type RecentCompanyItem = {
  ticker: string;
  name: string;
  viewedAt: string;
};

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
}

export function readRecentCompanies(): RecentCompanyItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(RECENT_COMPANIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentCompanyItem[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item?.ticker && item?.name)
      .map((item) => ({
        ticker: normalizeTicker(item.ticker),
        name: item.name,
        viewedAt: item.viewedAt || new Date().toISOString(),
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function recordRecentCompany(ticker: string, name: string) {
  if (typeof window === "undefined") return;

  const normalizedTicker = normalizeTicker(ticker);
  const current = readRecentCompanies().filter(
    (item) => item.ticker !== normalizedTicker
  );
  const next: RecentCompanyItem[] = [
    {
      ticker: normalizedTicker,
      name: name.trim() || normalizedTicker,
      viewedAt: new Date().toISOString(),
    },
    ...current,
  ].slice(0, 12);

  window.localStorage.setItem(
    RECENT_COMPANIES_STORAGE_KEY,
    JSON.stringify(next)
  );
  window.dispatchEvent(new Event("kessan-recent-companies-updated"));
}
