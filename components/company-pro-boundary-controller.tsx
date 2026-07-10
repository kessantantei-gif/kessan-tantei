"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function textOf(node: Element | null) {
  return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function findHeading(labels: string[]) {
  return Array.from(document.querySelectorAll("main[data-company-page='true'] h2, main[data-company-page='true'] h3, main[data-company-page='true'] p"))
    .find((node) => labels.some((label) => textOf(node).includes(label))) as HTMLElement | undefined;
}

function findCard(labels: string[]) {
  const heading = findHeading(labels);
  return heading?.closest("div.rounded-3xl, section.rounded-3xl, div.rounded-2xl, section.rounded-2xl") as HTMLElement | null;
}

function lockMarkup(title: string, message: string) {
  return `
    <div data-pro-boundary-lock="true" class="mt-4 rounded-2xl border border-yellow-300/30 bg-gradient-to-br from-yellow-400/15 via-yellow-400/8 to-white/[0.03] p-5 text-left">
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-yellow-300/25 bg-yellow-400/10 text-lg">🔒</div>
        <div class="min-w-0">
          <p class="text-xs font-black tracking-[0.2em] text-yellow-200">PRO ONLY</p>
          <p class="mt-2 text-lg font-black text-white">${title}</p>
          <p class="mt-2 text-sm leading-7 text-slate-300">${message}</p>
          <a href="/pricing" class="mt-4 inline-flex min-h-10 items-center justify-center rounded-full bg-yellow-400 px-5 py-2 text-xs font-black text-slate-950 hover:bg-yellow-300">初月100円で続きを見る</a>
        </div>
      </div>
    </div>
  `;
}

function replaceCardBody(card: HTMLElement | null, title: string, message: string, preview?: string) {
  if (!card || card.dataset.proBoundaryApplied === "true") return;
  card.dataset.proBoundaryApplied = "true";

  const heading = card.querySelector("h2, h3") as HTMLElement | null;
  const keep = heading ? heading.parentElement : null;
  const children = Array.from(card.children);

  for (const child of children) {
    if (child === keep || child === heading) continue;
    child.remove();
  }

  if (preview) {
    const previewBox = document.createElement("p");
    previewBox.className = "mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-300";
    previewBox.textContent = preview;
    card.appendChild(previewBox);
  }

  card.insertAdjacentHTML("beforeend", lockMarkup(title, message));
}

function lockTrend(labels: string[], title: string) {
  const card = findCard(labels);
  if (!card || card.dataset.proBoundaryApplied === "true") return;
  card.dataset.proBoundaryApplied = "true";

  const heading = card.querySelector("h2, h3, p") as HTMLElement | null;
  const children = Array.from(card.children);
  for (const child of children) {
    if (child === heading) continue;
    child.remove();
  }

  card.insertAdjacentHTML(
    "beforeend",
    lockMarkup(title, "売上推移は無料で確認できます。営業利益・営業CFの推移と変化分析はPro限定です。")
  );
}

function gateScoreExplanation() {
  const card = document.querySelector("[data-score-explanation='true']") as HTMLElement | null;
  if (!card || card.dataset.proBoundaryApplied === "true") return;
  card.dataset.proBoundaryApplied = "true";

  const scoreText = Array.from(card.querySelectorAll("p"))
    .map((node) => textOf(node))
    .find((text) => /^\d+$/.test(text));

  card.innerHTML = `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-xs font-bold tracking-[0.22em] text-slate-500">SCORE REASON</p>
        <h2 class="mt-2 text-xl font-black text-white">スコア根拠</h2>
        <p class="mt-2 text-sm leading-7 text-slate-400">無料版では総合スコアのみ表示しています。</p>
      </div>
      ${scoreText ? `<div class="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-5 py-3 text-center"><p class="text-xs font-bold text-cyan-200">総合</p><p class="text-2xl font-black text-cyan-100">${scoreText}</p></div>` : ""}
    </div>
    ${lockMarkup("スコアの内訳はPro限定", "成長性・収益品質・安全性・リスク控除の内訳と、各判定の根拠を確認できます。")}
  `;
}

function applyFreeBoundaries() {
  gateScoreExplanation();

  replaceCardBody(
    findCard(["決算探偵の見立て"]),
    "決算探偵の見立てはPro限定",
    "主要財務指標を横断して整理した見立て、注意点、今後確認すべきポイントを確認できます。",
    "財務ハイライトと総合スコアをもとに、詳細な見立てを作成しています。"
  );

  replaceCardBody(
    findCard(["Danger内訳", "Red Flags"]),
    "Danger内訳・Red FlagsはPro限定",
    "検出されたリスク項目、スコアへの影響、確認すべき開示内容を一覧で確認できます。"
  );

  replaceCardBody(
    findCard(["AI詳細財務分析"]),
    "AI詳細財務分析はPro限定",
    "収益性・キャッシュフロー・安全性・成長性を横断した全文分析を確認できます。"
  );

  lockTrend(["営業利益推移"], "営業利益推移はPro限定");
  lockTrend(["営業CF推移"], "営業CF推移はPro限定");
}

export default function CompanyProBoundaryController() {
  const pathname = usePathname();
  const isCompanyPage = pathname?.startsWith("/company/");

  useEffect(() => {
    if (!isCompanyPage) return;
    let cancelled = false;

    fetch("/api/pro-status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { isPro?: boolean } | null) => {
        if (cancelled || status?.isPro) return;

        const run = () => applyFreeBoundaries();
        run();
        requestAnimationFrame(run);
        const timers = [300, 800, 1600, 2600].map((delay) => window.setTimeout(run, delay));

        window.setTimeout(() => timers.forEach((timer) => window.clearTimeout(timer)), 3200);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isCompanyPage, pathname]);

  return null;
}
