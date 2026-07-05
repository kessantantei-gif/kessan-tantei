"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";

type HistoryRow = {
  year?: string | number;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type Payload = {
  history: HistoryRow[];
};

const PANELS = [
  { title: "売上推移", key: "revenue" as const },
  { title: "営業利益推移", key: "operatingIncome" as const },
  { title: "営業CF推移", key: "operatingCF" as const },
];

function yenOku(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const oku = value / 100_000_000;
  if (Math.abs(oku) >= 100) return `${oku.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}億円`;
  if (Math.abs(oku) >= 10) return `${oku.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}億円`;
  return `${oku.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}億円`;
}

function shortYenOku(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const oku = value / 100_000_000;
  if (Math.abs(oku) >= 100) return `${oku.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}億`;
  if (Math.abs(oku) >= 10) return `${oku.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}億`;
  return `${oku.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}億`;
}

function diffYenOku(current: number, previous?: number) {
  if (typeof previous !== "number" || !Number.isFinite(previous)) return "差額 —";

  const diff = current - previous;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${shortYenOku(diff)}`;
}

function yoyLabel(current: number, previous?: number) {
  if (typeof previous !== "number" || !Number.isFinite(previous) || previous === 0) {
    return { text: "前年差 —", tone: "neutral" as const };
  }

  const value = ((current - previous) / Math.abs(previous)) * 100;
  const sign = value >= 0 ? "+" : "";
  const arrow = value >= 0 ? "↑" : "↓";

  return {
    text: `${arrow}${sign}${value.toFixed(1)}%`,
    tone: value >= 0 ? "up" as const : "down" as const,
  };
}

function changeClass(tone: "up" | "down" | "neutral") {
  if (tone === "up") return "border-green-300/30 bg-green-950/70 text-green-200";
  if (tone === "down") return "border-red-300/30 bg-red-950/70 text-red-200";
  return "border-white/10 bg-black/55 text-slate-300";
}

function findTrendPanel(title: string) {
  const headings = Array.from(document.querySelectorAll("h2"));
  const heading = headings.find((node) => node.textContent?.trim() === title);
  return heading?.closest("div.rounded-3xl") ?? null;
}

function findChartArea(card: Element) {
  const candidates = Array.from(card.querySelectorAll("div"));
  return (
    candidates.find((node) =>
      node.className.toString().includes("items-end") &&
      node.className.toString().includes("h-36")
    ) ?? null
  );
}

function buildRichChart(rows: HistoryRow[], keyName: keyof HistoryRow) {
  const values = rows.map((row) => Math.abs(Number(row[keyName] ?? 0)));
  const max = Math.max(...values, 1);
  const latestYear = rows.at(-1)?.year;

  const chart = document.createElement("div");
  chart.dataset.trendValues = "true";
  chart.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4";

  const bars = document.createElement("div");
  bars.className = "flex h-60 items-end gap-3 sm:h-64 sm:gap-4";

  rows.forEach((row, index) => {
    const rawValue = Number(row[keyName] ?? 0);
    const previousValue = index > 0 ? Number(rows[index - 1][keyName] ?? NaN) : undefined;
    const change = yoyLabel(rawValue, previousValue);
    const diff = diffYenOku(rawValue, previousValue);
    const height = Math.max(78, (Math.abs(rawValue) / max) * 190);
    const isLatest = row.year === latestYear;

    const item = document.createElement("div");
    item.className = "flex min-w-0 flex-1 flex-col items-center gap-2";

    const barWrap = document.createElement("div");
    barWrap.className = "relative flex w-full items-end justify-center";
    barWrap.style.height = "205px";

    const bar = document.createElement("div");
    bar.className = rawValue >= 0
      ? `relative flex w-full items-start justify-center overflow-hidden rounded-t-2xl border bg-gradient-to-t from-green-500/70 to-cyan-300/90 shadow-lg shadow-green-950/20 ${isLatest ? "border-yellow-200/70 ring-2 ring-yellow-300/50" : "border-green-300/20"}`
      : `relative flex w-full items-start justify-center overflow-hidden rounded-t-2xl border bg-gradient-to-t from-red-600/70 to-orange-300/90 shadow-lg shadow-red-950/20 ${isLatest ? "border-yellow-200/70 ring-2 ring-yellow-300/50" : "border-red-300/20"}`;
    bar.style.height = `${height}px`;
    bar.title = `${row.year ?? "—"}: ${yenOku(rawValue)} / 前年差 ${diff} / ${change.text}`;

    const valueLabel = document.createElement("div");
    valueLabel.className = "absolute left-1 right-1 top-2 rounded-xl bg-black/50 px-1.5 py-1 text-center text-[10px] font-black leading-tight text-white backdrop-blur sm:text-xs";
    valueLabel.textContent = shortYenOku(rawValue);

    const diffLabel = document.createElement("div");
    diffLabel.className = `absolute left-1 right-1 top-10 rounded-xl border px-1.5 py-1 text-center text-[10px] font-black leading-tight backdrop-blur sm:text-xs ${changeClass(change.tone)}`;
    diffLabel.textContent = diff;

    const changeLabel = document.createElement("div");
    changeLabel.className = `absolute bottom-2 left-1 right-1 rounded-xl border px-1.5 py-1 text-center text-[10px] font-black leading-tight backdrop-blur sm:text-xs ${changeClass(change.tone)}`;
    changeLabel.textContent = change.text;

    bar.append(valueLabel, diffLabel, changeLabel);
    barWrap.append(bar);

    const year = document.createElement("div");
    year.className = isLatest
      ? "rounded-full border border-yellow-300/50 bg-yellow-300/15 px-2 py-1 text-[10px] font-black text-yellow-100 sm:text-xs"
      : "rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-slate-300 sm:text-xs";
    year.textContent = isLatest ? `${row.year ?? "—"} 最新` : String(row.year ?? "—");

    item.append(barWrap, year);
    bars.append(item);
  });

  const caption = document.createElement("p");
  caption.className = "mt-3 text-xs leading-6 text-slate-500";
  caption.textContent = "棒グラフ内の上段は金額、中段は前年からの増減額、下段は前年差率です。最新年度は黄色枠で表示しています。";

  chart.append(bars, caption);
  return chart;
}

function replaceChart(card: Element, rows: HistoryRow[], keyName: keyof HistoryRow) {
  const oldInjected = card.querySelector("[data-trend-values='true']");
  oldInjected?.remove();

  const oldChart = findChartArea(card);
  if (oldChart) {
    oldChart.replaceWith(buildRichChart(rows, keyName));
    return;
  }

  card.append(buildRichChart(rows, keyName));
}

export default function CompanyTrendValueInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => {
    const match = pathname?.match(/^\/company\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;

    fetch(`/api/company/${ticker}/history`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: Payload | null) => {
        if (cancelled || !payload || !Array.isArray(payload.history)) return;

        const rows = [...payload.history]
          .filter((row) => row && row.year !== undefined)
          .sort((a, b) => Number(a.year ?? 0) - Number(b.year ?? 0));

        if (rows.length === 0) return;

        for (const panel of PANELS) {
          const card = findTrendPanel(panel.title);
          if (!card) continue;
          replaceChart(card, rows, panel.key);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return null;
}
