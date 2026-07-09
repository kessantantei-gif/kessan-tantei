"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function textOf(node: Element | null) {
  return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function companyRoot() {
  const main = document.querySelector("main[data-company-page='true']") as HTMLElement | null;
  return main?.querySelector(":scope > section") as HTMLElement | null;
}

function findHeroGrid(root: HTMLElement) {
  const h1 = root.querySelector("h1");
  const heroCard = h1?.closest("div.rounded-3xl") as HTMLElement | null;
  return heroCard?.parentElement as HTMLElement | null;
}

function findCardByHeading(root: HTMLElement, labels: string[]) {
  const headings = Array.from(root.querySelectorAll("h2, p"));

  for (const heading of headings) {
    const text = textOf(heading);
    if (!labels.some((label) => text.includes(label))) continue;

    const card = heading.closest(
      "[data-company-ai-summary='true'], [data-company-financial-signals='true'], [data-company-peer-comparison='true'], [data-company-earnings-flash='true'], [data-score-explanation='true'], div.rounded-3xl, section.rounded-3xl, div.rounded-2xl, section.rounded-2xl"
    ) as HTMLElement | null;

    if (card && root.contains(card)) return card;
  }

  return null;
}

function findDataCard(root: HTMLElement, selector: string) {
  return root.querySelector(selector) as HTMLElement | null;
}

function moveAfter(anchor: HTMLElement, card: HTMLElement | null) {
  if (!card || card === anchor || !card.parentElement) return anchor;
  anchor.insertAdjacentElement("afterend", card);
  return card;
}

function tagSection(card: HTMLElement | null, label: string, description?: string) {
  if (!card || card.dataset.companySectionTagged === "true") return;
  card.dataset.companySectionTagged = "true";

  const badge = document.createElement("div");
  badge.className = "mb-3 flex flex-wrap items-center gap-2 text-xs";
  badge.innerHTML = `
    <span class="rounded-full border border-white/10 bg-white/10 px-3 py-1 font-black text-slate-200">${label}</span>
    ${description ? `<span class="text-slate-500">${description}</span>` : ""}
  `;

  card.insertBefore(badge, card.firstElementChild);
}

function tagProCards(root: HTMLElement) {
  const pricingLinks = Array.from(root.querySelectorAll("a[href='/pricing']"));

  for (const link of pricingLinks) {
    const card = link.closest("div.rounded-3xl, div.rounded-2xl") as HTMLElement | null;
    if (!card || card.dataset.proScopeTagged === "true") continue;
    card.dataset.proScopeTagged = "true";

    const scope = document.createElement("div");
    scope.className = "mb-4 rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-3 text-left text-xs leading-6 text-yellow-50";
    scope.innerHTML = `
      <p class="font-black text-yellow-200">ここから先はPro限定</p>
      <p class="mt-1 text-slate-300">無料：基本スコア・主要指標・ニュース・掲示板</p>
      <p class="text-slate-300">Pro：詳細分析、Red Flags、決算変化、全銘柄の深掘り</p>
    `;

    card.insertBefore(scope, card.firstElementChild);
  }
}

function reorderCompanyPage() {
  const root = companyRoot();
  if (!root) return;

  const heroGrid = findHeroGrid(root);
  if (!heroGrid) return;

  const comments = findCardByHeading(root, ["みんなのコメント"]);
  const news = findCardByHeading(root, ["ニュース / IR要約", "ニュース", "IR要約"]);
  const earnings = findDataCard(root, "[data-company-earnings-flash='true']") || findCardByHeading(root, ["決算速報", "決算変化速報"]);
  const aiSummary = findDataCard(root, "[data-company-ai-summary='true']");
  const scoreReason = findDataCard(root, "[data-score-explanation='true']") || findCardByHeading(root, ["スコア根拠", "スコアの見える化"]);
  const signals = findDataCard(root, "[data-company-financial-signals='true']");
  const peer = findDataCard(root, "[data-company-peer-comparison='true']") || findCardByHeading(root, ["同業比較"]);
  const trends = findCardByHeading(root, ["売上推移"])?.parentElement as HTMLElement | null;
  const detectiveAndRisk = findCardByHeading(root, ["決算探偵の見立て"])?.parentElement as HTMLElement | null;
  const aiDetail = findCardByHeading(root, ["AI詳細財務分析"])?.parentElement as HTMLElement | null;

  let anchor = heroGrid;
  anchor = moveAfter(anchor, comments);
  anchor = moveAfter(anchor, news);
  anchor = moveAfter(anchor, earnings);
  anchor = moveAfter(anchor, aiSummary);
  anchor = moveAfter(anchor, scoreReason);
  anchor = moveAfter(anchor, signals);
  anchor = moveAfter(anchor, peer);
  anchor = moveAfter(anchor, trends);
  anchor = moveAfter(anchor, detectiveAndRisk);
  anchor = moveAfter(anchor, aiDetail);

  tagSection(comments, "COMMUNITY", "投資家の反応を先に確認");
  tagSection(news, "NEWS / IR", "直近材料を確認");
  tagSection(earnings, "PRO CHECK", "決算変化の要点");
  tagSection(aiSummary, "AI SUMMARY", "短く要約");
  tagSection(scoreReason, "SCORE", "スコアの根拠");
  tagSection(signals, "SIGNALS", "財務シグナル");
  tagSection(peer, "PEERS", "同業比較");
  tagProCards(root);
}

export default function CompanyPageOrderController() {
  const pathname = usePathname();
  const isCompanyPage = pathname?.startsWith("/company/");

  useEffect(() => {
    if (!isCompanyPage) return;

    reorderCompanyPage();
    requestAnimationFrame(reorderCompanyPage);

    const timers = [250, 700, 1400, 2400].map((delay) =>
      window.setTimeout(reorderCompanyPage, delay)
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [isCompanyPage, pathname]);

  return null;
}
