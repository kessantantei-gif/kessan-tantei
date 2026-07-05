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

  return `${(value / 100_000_000).toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}億円`;
}

function createValueTable(rows: HistoryRow[], keyName: keyof HistoryRow) {
  const wrapper = document.createElement("div");
  wrapper.dataset.trendValues = "true";
  wrapper.className = "mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20";

  const table = document.createElement("table");
  table.className = "w-full border-collapse text-xs";

  const thead = document.createElement("thead");
  thead.className = "bg-white/5 text-slate-500";

  const headRow = document.createElement("tr");
  const yearHead = document.createElement("th");
  yearHead.className = "px-3 py-2 text-left font-black";
  yearHead.textContent = "年度";
  const valueHead = document.createElement("th");
  valueHead.className = "px-3 py-2 text-right font-black";
  valueHead.textContent = "数値";
  headRow.append(yearHead, valueHead);
  thead.append(headRow);

  const tbody = document.createElement("tbody");

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "border-t border-white/10";

    const year = document.createElement("td");
    year.className = "px-3 py-2 font-bold text-slate-300";
    year.textContent = String(row.year ?? "—");

    const value = document.createElement("td");
    value.className = "px-3 py-2 text-right font-black text-white";
    value.textContent = yenOku(row[keyName] as number | undefined);

    tr.append(year, value);
    tbody.append(tr);
  }

  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function findTrendPanel(title: string) {
  const headings = Array.from(document.querySelectorAll("h2"));
  const heading = headings.find((node) => node.textContent?.trim() === title);
  return heading?.closest("div.rounded-3xl") ?? null;
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
          .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0));

        if (rows.length === 0) return;

        for (const panel of PANELS) {
          const card = findTrendPanel(panel.title);
          if (!card || card.querySelector("[data-trend-values='true']")) continue;
          card.append(createValueTable(rows, panel.key));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return null;
}
