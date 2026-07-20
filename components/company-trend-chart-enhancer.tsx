"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";

type TrendKey = "revenue" | "operatingIncome" | "operatingCF";

type HistoryRow = {
  year?: string | number;
  fiscalYear?: string | number;
  fiscal_year?: string | number;
  fiscalPeriod?: string;
  fiscal_period?: string;
  period?: string;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type FinancialMetadata = {
  financialProfile?: string;
  revenueLabel?: string;
  operatingIncomeLabel?: string;
  currentRatioApplicable?: boolean;
};

type Payload = {
  history: HistoryRow[];
  financials?: FinancialMetadata;
};

type MetricLabels = {
  revenue: string;
  operatingIncome: string;
};

const MAX_VISIBLE_PERIODS = 3;

const PANELS: { sourceTitle: string; key: TrendKey }[] = [
  { sourceTitle: "売上推移", key: "revenue" },
  { sourceTitle: "営業利益推移", key: "operatingIncome" },
  { sourceTitle: "営業CF推移", key: "operatingCF" },
];

function metricLabels(financials?: FinancialMetadata): MetricLabels {
  return {
    revenue: financials?.revenueLabel?.trim() || "売上高",
    operatingIncome:
      financials?.operatingIncomeLabel?.trim() || "営業利益",
  };
}

function panelTitle(key: TrendKey, labels: MetricLabels) {
  if (key === "revenue") return `${labels.revenue}推移`;
  if (key === "operatingIncome") return `${labels.operatingIncome}推移`;
  return "営業CF推移";
}

function formatOku(value?: number | null, suffix = "億円") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const oku = value / 100_000_000;
  const abs = Math.abs(oku);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${oku.toLocaleString("ja-JP", {
    maximumFractionDigits: digits,
  })} ${suffix}`;
}

function displayPeriod(row?: HistoryRow) {
  if (!row) return "最新";
  const rawPeriod = row.fiscalPeriod ?? row.fiscal_period ?? row.period;
  if (typeof rawPeriod === "string" && rawPeriod.trim()) {
    return rawPeriod.trim();
  }
  const rawYear = row.fiscalYear ?? row.fiscal_year ?? row.year;
  if (rawYear === undefined || rawYear === null || rawYear === "") {
    return "年度不明";
  }
  return `${rawYear}年期`;
}

function sortKey(row: HistoryRow) {
  const raw = row.fiscalYear ?? row.fiscal_year ?? row.year;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizedRows(rows: HistoryRow[]) {
  return rows
    .filter(
      (row) =>
        row &&
        (row.year !== undefined ||
          row.fiscalYear !== undefined ||
          row.fiscal_year !== undefined)
    )
    .sort((a, b) => sortKey(a) - sortKey(b))
    .slice(-MAX_VISIBLE_PERIODS);
}

function findTrendCard(titles: string[]) {
  const headings = Array.from(document.querySelectorAll("h2"));
  const heading = headings.find((node) =>
    titles.includes(node.textContent?.trim() ?? "")
  );
  return heading?.closest("div.rounded-3xl") as HTMLElement | null;
}

function buildChart(rows: HistoryRow[], key: TrendKey) {
  const cleanRows = normalizedRows(rows);
  const values = cleanRows.map((row) => Number(row[key] ?? 0));
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);

  const root = document.createElement("div");
  root.dataset.kessanTrendEnhanced = "true";
  root.className = "mt-4 w-full max-w-full space-y-4 overflow-hidden";

  if (cleanRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-slate-400";
    empty.textContent = "データなし";
    root.append(empty);
    return root;
  }

  for (const row of cleanRows) {
    const value = Number(row[key] ?? 0);
    const width = Math.max(
      3,
      Math.min(100, (Math.abs(value) / max) * 100)
    );
    const isPositive = value >= 0;

    const item = document.createElement("div");
    item.className = "min-w-0";

    const head = document.createElement("div");
    head.className =
      "mb-2 flex min-w-0 items-baseline justify-between gap-3";

    const period = document.createElement("p");
    period.className =
      "min-w-0 truncate text-sm font-bold text-slate-400 sm:text-base";
    period.textContent = displayPeriod(row);

    const amount = document.createElement("p");
    amount.className =
      "shrink-0 text-right text-sm font-black text-slate-200 sm:text-base";
    amount.textContent = formatOku(value);

    const rail = document.createElement("div");
    rail.className =
      "h-3 w-full max-w-full overflow-hidden rounded-full bg-white/10";

    const bar = document.createElement("div");
    bar.className = isPositive
      ? "h-full rounded-full bg-green-400"
      : "h-full rounded-full bg-red-400";
    bar.style.width = `${width}%`;

    head.append(period, amount);
    rail.append(bar);
    item.append(head, rail);
    root.append(item);
  }

  return root;
}

function replaceStandaloneMetricLabels(labels: MetricLabels) {
  const replacements = new Map<string, string>([
    ["売上高", labels.revenue],
    ["営業利益", labels.operatingIncome],
    ["売上成長率", `${labels.revenue}成長率`],
    ["営業利益率", `${labels.operatingIncome}率`],
  ]);

  for (const node of Array.from(
    document.querySelectorAll("p, h2, h3, span")
  )) {
    const current = node.textContent?.trim() ?? "";
    const replacement = replacements.get(current);
    if (replacement && replacement !== current) {
      node.textContent = replacement;
    }
  }
}

function applyCharts(history: HistoryRow[], labels: MetricLabels) {
  for (const panel of PANELS) {
    const targetTitle = panelTitle(panel.key, labels);
    const card = findTrendCard([panel.sourceTitle, targetTitle]);
    if (!card) continue;

    const heading = Array.from(card.querySelectorAll("h2")).find((node) => {
      const title = node.textContent?.trim() ?? "";
      return title === panel.sourceTitle || title === targetTitle;
    });
    if (!heading) continue;

    heading.textContent = targetTitle;

    const already = card.querySelector(
      "[data-kessan-trend-enhanced='true']"
    );
    if (already) continue;

    const existingContent = heading.nextElementSibling;
    if (existingContent) existingContent.remove();
    heading.insertAdjacentElement("afterend", buildChart(history, panel.key));
  }

  replaceStandaloneMetricLabels(labels);
}

export default function CompanyTrendChartEnhancer() {
  const pathname = usePathname();
  const ticker = useMemo(() => {
    const match = pathname?.match(/^\/company\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    fetch(`/api/company/${ticker}/history`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: Payload | null) => {
        if (cancelled || !payload || !Array.isArray(payload.history)) return;

        const labels = metricLabels(payload.financials);
        const run = () => applyCharts(payload.history, labels);
        run();
        requestAnimationFrame(run);
        window.setTimeout(run, 150);

        observer = new MutationObserver(run);
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(() => observer?.disconnect(), 2000);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [ticker]);

  return null;
}
