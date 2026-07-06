export const ALERTS_STORAGE_KEY = "kessan-tantei-alerts";

export type AlertCondition =
  | "earnings-updated"
  | "danger-score-up"
  | "score-up"
  | "operating-cf-down";

export type AlertSetting = {
  ticker: string;
  name: string;
  conditions: AlertCondition[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export const alertConditionLabels: Record<AlertCondition, string> = {
  "earnings-updated": "決算更新",
  "danger-score-up": "Danger Score悪化",
  "score-up": "総合スコア上昇",
  "operating-cf-down": "営業CF悪化",
};

export const defaultAlertConditions: AlertCondition[] = [
  "earnings-updated",
  "danger-score-up",
  "score-up",
];

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
}

export function readAlertSettings(): AlertSetting[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AlertSetting[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item?.ticker && item?.name)
      .map((item) => ({
        ticker: normalizeTicker(item.ticker),
        name: item.name,
        conditions: Array.isArray(item.conditions) ? item.conditions : defaultAlertConditions,
        enabled: item.enabled !== false,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export function writeAlertSettings(items: AlertSetting[]) {
  if (typeof window === "undefined") return;

  const unique = new Map<string, AlertSetting>();
  for (const item of items) {
    const ticker = normalizeTicker(item.ticker);
    unique.set(ticker, {
      ...item,
      ticker,
      updatedAt: item.updatedAt || new Date().toISOString(),
    });
  }

  window.localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify([...unique.values()]));
  window.dispatchEvent(new Event("kessan-alerts-updated"));
}

export function upsertAlertSetting(ticker: string, name: string, conditions = defaultAlertConditions) {
  const normalizedTicker = normalizeTicker(ticker);
  const current = readAlertSettings();
  const now = new Date().toISOString();
  const existing = current.find((item) => item.ticker === normalizedTicker);

  const next = existing
    ? current.map((item) =>
        item.ticker === normalizedTicker
          ? { ...item, name, conditions, enabled: true, updatedAt: now }
          : item
      )
    : [
        ...current,
        {
          ticker: normalizedTicker,
          name,
          conditions,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ];

  writeAlertSettings(next);
  return next;
}

export function removeAlertSetting(ticker: string) {
  const normalizedTicker = normalizeTicker(ticker);
  const next = readAlertSettings().filter((item) => item.ticker !== normalizedTicker);
  writeAlertSettings(next);
  return next;
}

export function toggleAlertSetting(ticker: string) {
  const normalizedTicker = normalizeTicker(ticker);
  const now = new Date().toISOString();
  const next = readAlertSettings().map((item) =>
    item.ticker === normalizedTicker ? { ...item, enabled: !item.enabled, updatedAt: now } : item
  );
  writeAlertSettings(next);
  return next;
}
