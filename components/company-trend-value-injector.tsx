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

function trendSummary(rows: HistoryRow[], keyName: keyof HistoryRow) {
  const latest = rows.at(-1);
  const previous = rows.length >= 2 ? rows.at(-2) : undefined;
  const latestValue = Number(latest?.[keyName] ?? NaN);
  const previousValue = Number(previous?.[keyName] ?? NaN);
  const change = yoyLabel(latestValue, previousValue);
  const diff = diffYenOku(latestValue, previousValue);

  let verdict = "横ばい";
  if (change.tone === "up") verdict = "改善・拡大";
  if (change.tone === "down") verdict = "悪化・縮小";
  if (!Number.isFinite(latestValue)) verdict = "データ不足";

  return {
    latestYear: latest?.year ?? "最新",
    latestValue,
    diff,
    change,
    verdict,
  };
}

function changeClass(tone: "up" | "down" | "neutral") {
  if (tone === "up") return "border-green-300/30 bg-green-950/70 text-green-200";
  if (tone === "down") return "border-red-300/30 bg-red-950/70 text-red-200";
  return "border-white/10 bg-black/55 text-slate-300";
}

function summaryToneClass(tone: "up" | "down" | "neutral") {
  if (tone === "up") return "border-green-300/25 bg-green-500/10 text-green-200";
  if (tone === "down") return "border-red-300/25 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/5 text-slate-300";
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

function addScaleGuide(chartBody: HTMLDivElement, max: number) {
  const guide = document.createElement("div");
  guide.className = "pointer-events-none absolute inset-x-0 bottom-10 top-0 z-0";

  const ticks = [
    { label: shortYenOku(max), top: "0%" },
    { label: shortYenOku(max / 2), top: "50%" },
    { label: "0", top: "100%" },
  ];

  for (const tick of ticks) {
    const row = document.createElement("div");
    row.className = "absolute left-0 right-0 flex items-center gap-2";
    row.style.top = tick.top;

    const label = document.createElement("span");
    label.className = "w-12 shrink-0 text-right text-[10px] font-bold text-slate-500";
    label.textContent = tick.label;

    const line = document.createElement("span");
    line.className = "h-px flex-1 bg-white/10";

    row.append(label, line);
    guide.append(row);
  }

  chartBody.append(guide);
}

function addSummary(chart: HTMLDivElement, rows: HistoryRow[], keyName: keyof HistoryRow) {
  const summary = trendSummary(rows, keyName);

  const wrapper = document.createElement("div");
  wrapper.className = "mb-4 grid gap-2 sm:grid-cols-3";

  const cards = [
    { label: `${summary.latestYear} 最新値`, value: yenOku(summary.latestValue), className: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100" },
    { label: "前年増減", value: `${summary.diff} / ${summary.change.text}`, className: summaryToneClass(summary.change.tone) },
    { label: "トレンド判定", value: summary.verdict, className: summaryToneClass(summary.change.tone) },
  ];

  for (const card of cards) {
    const node = document.createElement("div");
    node.className = `rounded-2xl border p-3 ${card.className}`;

    const label = document.createElement("p");
    label.className = "text-[10px] font-bold tracking-[0.18em] opacity-70";
    label.textContent = card.label;

    const value = document.createElement("p");
    value.className = "mt-1 text-sm font-black sm:text-base";
    value.textContent = card.value;

    node.append(label, value);
    wrapper.append(node);
  }

  chart.append(wrapper);
}

function buildRichChart(rows: HistoryRow[], keyName: keyof HistoryRow) {
  const values = rows.map((row) => Math.abs(Number(row[keyName] ?? 0)));
  const max = Math.max(...values, 1);
  const latestYear = rows.at(-1)?.year;

  const chart = document.createElement("div");
  chart.dataset.trendValues = "true";
  chart.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4";

  addSummary(chart, rows, keyName);

  const chartBody = document.createElement("div");
  chartBody.className = "relative";

  addScaleGuide(chartBody, max);

  const bars = document.createElement("div");
  bars.className = "relative z-10 ml-14 flex h-60 items-end gap-3 sm:h-64 sm:gap-4";

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

  chartBody.append(bars);

  const caption = document.createElement("p");
  caption.className = "mt-3 text-xs leading-6 text-slate-500";
  caption.textContent = "左の目盛りは最大値・半分・0の目安です。棒グラフ内の上段は金額、中段は増減額、下段は前年差率です。";

  chart.append(chartBody, caption);
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
