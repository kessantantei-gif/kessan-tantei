"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";

type TrendKey = "revenue" | "operatingIncome" | "operatingCF";

type HistoryRow = {
  year?: string | number;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type Payload = {
  history: HistoryRow[];
};

const PANELS: { title: string; key: TrendKey }[] = [
  { title: "売上推移", key: "revenue" },
  { title: "営業利益推移", key: "operatingIncome" },
  { title: "営業CF推移", key: "operatingCF" },
];

function formatOku(value?: number | null, suffix = "億") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const oku = value / 100_000_000;
  const abs = Math.abs(oku);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${oku.toLocaleString("ja-JP", { maximumFractionDigits: digits })}${suffix}`;
}

function formatDiff(current?: number, previous?: number) {
  if (
    typeof current !== "number" ||
    typeof previous !== "number" ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return { amount: "—", rate: "—", up: null as boolean | null };
  }

  const diff = current - previous;
  const up = diff >= 0;
  const sign = up ? "+" : "";
  const rate = previous === 0 ? "—" : `${sign}${((diff / Math.abs(previous)) * 100).toFixed(1)}%`;

  return {
    amount: `${sign}${formatOku(diff)}`,
    rate,
    up,
  };
}

function findTrendCard(title: string) {
  const headings = Array.from(document.querySelectorAll("h2"));
  const heading = headings.find((node) => node.textContent?.trim() === title);
  return heading?.closest("div.rounded-3xl") as HTMLElement | null;
}

function findOriginalChart(card: HTMLElement) {
  const candidates = Array.from(card.querySelectorAll("div"));
  return candidates.find((node) => {
    const className = node.className.toString();
    return className.includes("mt-6") && className.includes("items-end") && className.includes("h-36");
  }) as HTMLElement | undefined;
}

function trendVerdict(key: TrendKey, latest?: number, previous?: number) {
  if (typeof latest !== "number" || !Number.isFinite(latest)) return "データ不足";
  if (typeof previous !== "number" || !Number.isFinite(previous)) return "比較データ不足";

  if (key === "revenue") {
    if (latest > previous) return "増収";
    if (latest < previous) return "減収";
    return "横ばい";
  }

  if (previous < 0 && latest >= 0) return key === "operatingCF" ? "CF黒字転換" : "黒字転換";
  if (previous >= 0 && latest < 0) return key === "operatingCF" ? "CF赤字転落" : "赤字転落";
  if (latest > previous) return previous < 0 ? "赤字縮小" : "改善";
  if (latest < previous) return latest < 0 ? "赤字拡大" : "悪化";
  return "横ばい";
}

function buildChart(rows: HistoryRow[], key: TrendKey) {
  const cleanRows = rows
    .filter((row) => row && row.year !== undefined)
    .sort((a, b) => Number(a.year ?? 0) - Number(b.year ?? 0));

  const values = cleanRows.map((row) => Math.abs(Number(row[key] ?? 0)));
  const max = Math.max(...values, 1);
  const latest = cleanRows.at(-1);
  const previous = cleanRows.at(-2);
  const latestValue = Number(latest?.[key] ?? NaN);
  const previousValue = Number(previous?.[key] ?? NaN);
  const latestDiff = formatDiff(latestValue, previousValue);
  const verdict = trendVerdict(key, latestValue, previousValue);

  const root = document.createElement("div");
  root.dataset.kessanTrendEnhanced = "true";
  root.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4";

  const summary = document.createElement("div");
  summary.className = "grid gap-2 sm:grid-cols-3";

  const summaryItems = [
    { label: `${latest?.year ?? "最新"} 最新値`, value: formatOku(latestValue, "億円"), tone: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100" },
    { label: "前年差", value: `${latestDiff.amount} / ${latestDiff.rate}`, tone: latestDiff.up === false ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-green-300/20 bg-green-500/10 text-green-100" },
    { label: "判定", value: verdict, tone: latestDiff.up === false ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-green-300/20 bg-green-500/10 text-green-100" },
  ];

  for (const item of summaryItems) {
    const box = document.createElement("div");
    box.className = `rounded-2xl border p-3 ${item.tone}`;

    const label = document.createElement("p");
    label.className = "text-[10px] font-bold tracking-[0.18em] opacity-70";
    label.textContent = item.label;

    const value = document.createElement("p");
    value.className = "mt-1 text-sm font-black sm:text-base";
    value.textContent = item.value;

    box.append(label, value);
    summary.append(box);
  }

  const graph = document.createElement("div");
  graph.className = "mt-5 flex h-44 items-end gap-3 sm:h-48 sm:gap-4";

  if (cleanRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-slate-400";
    empty.textContent = "データなし";
    root.append(summary, empty);
    return root;
  }

  cleanRows.forEach((row, index) => {
    const value = Number(row[key] ?? 0);
    const prev = index > 0 ? Number(cleanRows[index - 1][key] ?? NaN) : undefined;
    const diff = formatDiff(value, prev);
    const height = Math.max(38, (Math.abs(value) / max) * 145);
    const isLatest = row.year === latest?.year;

    const item = document.createElement("div");
    item.className = "flex min-w-0 flex-1 flex-col items-center gap-2";

    const barWrap = document.createElement("div");
    barWrap.className = "relative flex h-36 w-full items-end justify-center sm:h-40";

    const bar = document.createElement("div");
    bar.className = value >= 0
      ? `relative w-full overflow-hidden rounded-t-2xl border bg-gradient-to-t from-green-500/75 to-cyan-300/90 ${isLatest ? "border-yellow-200/70 ring-2 ring-yellow-300/40" : "border-green-300/20"}`
      : `relative w-full overflow-hidden rounded-t-2xl border bg-gradient-to-t from-red-600/75 to-orange-300/90 ${isLatest ? "border-yellow-200/70 ring-2 ring-yellow-300/40" : "border-red-300/20"}`;
    bar.style.height = `${height}px`;
    bar.title = `${row.year ?? "—"}: ${formatOku(value, "億円")} / 前年差 ${diff.amount} / ${diff.rate}`;

    const valueLabel = document.createElement("div");
    valueLabel.className = "absolute left-1 right-1 top-2 rounded-xl bg-black/50 px-1 py-1 text-center text-[10px] font-black leading-tight text-white backdrop-blur sm:text-xs";
    valueLabel.textContent = formatOku(value);

    const diffLabel = document.createElement("div");
    diffLabel.className = diff.up === false
      ? "absolute bottom-2 left-1 right-1 rounded-xl border border-red-300/30 bg-red-950/70 px-1 py-1 text-center text-[10px] font-black leading-tight text-red-100 backdrop-blur sm:text-xs"
      : "absolute bottom-2 left-1 right-1 rounded-xl border border-green-300/30 bg-green-950/70 px-1 py-1 text-center text-[10px] font-black leading-tight text-green-100 backdrop-blur sm:text-xs";
    diffLabel.textContent = index === 0 ? "前年差—" : diff.rate;

    bar.append(valueLabel, diffLabel);
    barWrap.append(bar);

    const year = document.createElement("div");
    year.className = isLatest
      ? "rounded-full border border-yellow-300/50 bg-yellow-300/15 px-2 py-1 text-[10px] font-black text-yellow-100 sm:text-xs"
      : "rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-slate-300 sm:text-xs";
    year.textContent = isLatest ? `${row.year ?? "—"} 最新` : String(row.year ?? "—");

    item.append(barWrap, year);
    graph.append(item);
  });

  const caption = document.createElement("p");
  caption.className = "mt-3 text-xs leading-6 text-slate-500";
  caption.textContent = "棒の上段は金額、下段は前年差率です。最新年度は黄色枠で表示しています。";

  root.append(summary, graph, caption);
  return root;
}

function applyCharts(history: HistoryRow[]) {
  for (const panel of PANELS) {
    const card = findTrendCard(panel.title);
    if (!card) continue;

    const already = card.querySelector("[data-kessan-trend-enhanced='true']");
    if (already) continue;

    const original = findOriginalChart(card);
    if (!original) continue;

    original.replaceWith(buildChart(history, panel.key));
  }
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
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: Payload | null) => {
        if (cancelled || !payload || !Array.isArray(payload.history)) return;

        const run = () => applyCharts(payload.history);
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
