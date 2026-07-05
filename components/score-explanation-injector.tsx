"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";

type Payload = {
  score: number;
  scoreBreakdown: { growth?: number; quality?: number; safety?: number };
  financials: {
    revenueGrowth?: number;
    grossProfitGrowth?: number;
    operatingMargin?: number;
    operatingCFMargin?: number;
    equityRatio?: number;
  };
  riskFlags?: { title?: string; level?: string; scoreImpact?: number }[];
};

function pct(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "データなし";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function stars(value: number) {
  const count = Math.max(1, Math.min(5, Math.round(value / 20)));
  return "★".repeat(count) + "☆".repeat(5 - count);
}

function reasonRows(payload: Payload) {
  const f = payload.financials ?? {};
  const rows: { sign: string; text: string; detail: string; tone: string }[] = [];

  if (typeof f.revenueGrowth === "number") {
    if (f.revenueGrowth >= 30) rows.push({ sign: "+", text: "売上成長率が高水準", detail: pct(f.revenueGrowth), tone: "text-green-300" });
    else if (f.revenueGrowth >= 0) rows.push({ sign: "±", text: "売上は増加傾向", detail: pct(f.revenueGrowth), tone: "text-yellow-300" });
    else rows.push({ sign: "−", text: "売上が減少", detail: pct(f.revenueGrowth), tone: "text-red-300" });
  }

  if (typeof f.grossProfitGrowth === "number") {
    if (f.grossProfitGrowth >= 20) rows.push({ sign: "+", text: "売上総利益が伸長", detail: pct(f.grossProfitGrowth), tone: "text-green-300" });
    else if (f.grossProfitGrowth < 0) rows.push({ sign: "−", text: "売上総利益が減少", detail: pct(f.grossProfitGrowth), tone: "text-red-300" });
  }

  if (typeof f.operatingMargin === "number") {
    if (f.operatingMargin >= 10) rows.push({ sign: "+", text: "営業利益率が良好", detail: pct(f.operatingMargin), tone: "text-green-300" });
    else if (f.operatingMargin >= 0) rows.push({ sign: "±", text: "営業黒字を確保", detail: pct(f.operatingMargin), tone: "text-yellow-300" });
    else rows.push({ sign: "−", text: "営業赤字", detail: pct(f.operatingMargin), tone: "text-red-300" });
  }

  if (typeof f.operatingCFMargin === "number") {
    if (f.operatingCFMargin > 0) rows.push({ sign: "+", text: "営業CF率がプラス", detail: pct(f.operatingCFMargin), tone: "text-green-300" });
    else rows.push({ sign: "−", text: "営業CF率がマイナス", detail: pct(f.operatingCFMargin), tone: "text-red-300" });
  }

  if (typeof f.equityRatio === "number") {
    if (f.equityRatio >= 50) rows.push({ sign: "+", text: "自己資本比率が高め", detail: pct(f.equityRatio), tone: "text-green-300" });
    else if (f.equityRatio < 20) rows.push({ sign: "−", text: "自己資本比率に注意", detail: pct(f.equityRatio), tone: "text-red-300" });
  }

  for (const flag of (payload.riskFlags ?? []).slice(0, 3)) {
    rows.push({ sign: "−", text: flag.title ?? "リスクシグナルあり", detail: flag.scoreImpact ? `影響 +${flag.scoreImpact}` : flag.level ?? "要確認", tone: "text-red-300" });
  }

  return rows.slice(0, 8);
}

function normalizedBreakdown(payload: Payload) {
  return [
    { label: "成長性", value: Math.min(100, Math.round(((payload.scoreBreakdown?.growth ?? 0) / 40) * 100)) },
    { label: "収益・CF品質", value: Math.min(100, Math.round(((payload.scoreBreakdown?.quality ?? 0) / 30) * 100)) },
    { label: "安全性・リスク", value: Math.min(100, Math.round(((payload.scoreBreakdown?.safety ?? 0) / 30) * 100)) },
  ];
}

function buildCard(payload: Payload) {
  const root = document.createElement("div");
  root.dataset.scoreExplanation = "true";
  root.className = "mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left";

  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-3";
  header.innerHTML = `
    <div>
      <p class="text-xs font-bold tracking-[0.22em] text-slate-500">SCORE REASON</p>
      <h2 class="mt-2 text-lg font-black text-white">スコアの見える化</h2>
    </div>
    <div class="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-right">
      <p class="text-[10px] font-bold text-cyan-200">総合</p>
      <p class="text-lg font-black text-cyan-100">${payload.score ?? 0}</p>
    </div>
  `;
  root.append(header);

  const bars = document.createElement("div");
  bars.className = "mt-4 space-y-3";
  for (const item of normalizedBreakdown(payload)) {
    const row = document.createElement("div");
    row.innerHTML = `
      <div class="mb-1 flex items-center justify-between gap-2 text-xs">
        <span class="font-bold text-slate-300">${item.label}</span>
        <span class="font-black text-cyan-200">${stars(item.value)} ${item.value}</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-white/10">
        <div class="h-full rounded-full bg-white/70" style="width:${Math.max(4, Math.min(100, item.value))}%"></div>
      </div>
    `;
    bars.append(row);
  }
  root.append(bars);

  const reasons = document.createElement("div");
  reasons.className = "mt-4 space-y-2";
  const rows = reasonRows(payload);

  if (rows.length === 0) {
    reasons.innerHTML = `<p class="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-400">スコア根拠を表示できる指標がまだ不足しています。</p>`;
  } else {
    for (const item of rows) {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3";
      row.innerHTML = `
        <div class="flex min-w-0 items-center gap-2">
          <span class="text-sm font-black ${item.tone}">${item.sign}</span>
          <p class="truncate text-sm font-bold text-slate-200">${item.text}</p>
        </div>
        <p class="shrink-0 text-xs font-bold text-slate-400">${item.detail}</p>
      `;
      reasons.append(row);
    }
  }
  root.append(reasons);

  const note = document.createElement("p");
  note.className = "mt-3 text-xs leading-5 text-slate-500";
  note.textContent = "財務指標とリスクシグナルを機械的に整理した表示です。買い・売り等の投資判断を示すものではありません。";
  root.append(note);

  return root;
}

function findScoreCard() {
  const nodes = Array.from(document.querySelectorAll("p"));
  const label = nodes.find((node) => node.textContent?.trim() === "TOTAL SCORE");
  return label?.closest("div.rounded-3xl") as HTMLElement | null;
}

export default function ScoreExplanationInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null, [pathname]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;

    fetch(`/api/company/${ticker}/score-explanation`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: Payload | null) => {
        if (cancelled || !payload) return;

        const run = () => {
          const card = findScoreCard();
          if (!card || card.querySelector("[data-score-explanation='true']")) return;
          card.append(buildCard(payload));
        };

        run();
        requestAnimationFrame(run);
        window.setTimeout(run, 150);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return null;
}
