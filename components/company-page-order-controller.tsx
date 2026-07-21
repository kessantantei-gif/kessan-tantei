"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function textOf(node: Element | null) {
  return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function companyRoot() {
  const main = document.querySelector(
    "main[data-company-page='true']"
  ) as HTMLElement | null;
  return main?.querySelector(":scope > section") as HTMLElement | null;
}

function findHeroGrid(root: HTMLElement) {
  const h1 = root.querySelector("h1");
  const heroCard = h1?.closest("div.rounded-3xl") as HTMLElement | null;
  return heroCard?.parentElement as HTMLElement | null;
}

function findCardByHeading(root: HTMLElement, labels: string[]) {
  const headings = Array.from(root.querySelectorAll("h2, h3, p"));

  for (const heading of headings) {
    const text = textOf(heading);
    if (!labels.some((label) => text.includes(label))) continue;

    const card = heading.closest(
      "[data-company-ai-summary='true'], [data-company-financial-signals='true'], [data-company-peer-comparison='true'], [data-company-earnings-flash='true'], [data-company-pro-analysis='true'], [data-score-explanation='true'], div.rounded-3xl, section.rounded-3xl, div.rounded-2xl, section.rounded-2xl"
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
  if (!card) return;

  const existing = card.querySelector(
    ":scope > [data-company-section-label='true']"
  ) as HTMLElement | null;
  if (existing) {
    const title = existing.querySelector("[data-section-title='true']");
    const note = existing.querySelector("[data-section-note='true']");
    if (title) title.textContent = label;
    if (note) note.textContent = description ?? "";
    return;
  }

  const badge = document.createElement("div");
  badge.dataset.companySectionLabel = "true";
  badge.className = "mb-3 flex flex-wrap items-center gap-2 text-xs";

  const title = document.createElement("span");
  title.dataset.sectionTitle = "true";
  title.className =
    "rounded-full border border-white/10 bg-white/10 px-3 py-1 font-black text-slate-200";
  title.textContent = label;
  badge.appendChild(title);

  if (description) {
    const note = document.createElement("span");
    note.dataset.sectionNote = "true";
    note.className = "text-slate-500";
    note.textContent = description;
    badge.appendChild(note);
  }

  card.insertBefore(badge, card.firstElementChild);
}

function normalizeSectionSpacing(root: HTMLElement) {
  const sections = Array.from(
    root.querySelectorAll(
      "[data-company-ai-summary='true'], [data-company-financial-signals='true'], [data-company-peer-comparison='true'], [data-company-earnings-flash='true'], [data-company-pro-analysis='true'], [data-score-explanation='true']"
    )
  ) as HTMLElement[];

  for (const section of sections) {
    section.classList.add("w-full", "min-w-0");
  }
}

function reorderCompanyPage() {
  const root = companyRoot();
  if (!root) return;

  const heroGrid = findHeroGrid(root);
  if (!heroGrid) return;

  const news = findCardByHeading(root, [
    "ニュース / IR要約",
    "ニュース",
    "IR要約",
  ]);
  const comments = findCardByHeading(root, ["みんなのコメント", "掲示板"]);
  const earnings =
    findDataCard(root, "[data-company-earnings-flash='true']") ||
    findCardByHeading(root, ["決算速報", "決算変化速報"]);
  const aiSummary = findDataCard(root, "[data-company-ai-summary='true']");
  const scoreReason =
    findDataCard(root, "[data-score-explanation='true']") ||
    findCardByHeading(root, ["スコア根拠", "スコアの見える化"]);
  const signals = findDataCard(
    root,
    "[data-company-financial-signals='true']"
  );
  const proAnalysis =
    findDataCard(root, "[data-company-pro-analysis='true']") ||
    findCardByHeading(root, ["Pro分析", "AI詳細財務分析"]);
  const detectiveAndRisk =
    (findCardByHeading(root, ["決算探偵の見立て"])?.parentElement as
      | HTMLElement
      | null) ||
    (findCardByHeading(root, ["Danger内訳", "Red Flags"])?.parentElement as
      | HTMLElement
      | null);
  const trends =
    (findCardByHeading(root, ["売上推移"])?.parentElement as HTMLElement | null) ||
    findCardByHeading(root, ["営業利益推移", "営業CF推移"]);
  const peer =
    findDataCard(root, "[data-company-peer-comparison='true']") ||
    findCardByHeading(root, ["比較候補", "事業テーマ比較", "同業比較"]);

  let anchor = heroGrid;
  anchor = moveAfter(anchor, news);
  anchor = moveAfter(anchor, comments);
  anchor = moveAfter(anchor, earnings);
  anchor = moveAfter(anchor, aiSummary);
  anchor = moveAfter(anchor, scoreReason);
  anchor = moveAfter(anchor, signals);
  anchor = moveAfter(anchor, proAnalysis);
  anchor = moveAfter(anchor, detectiveAndRisk);
  anchor = moveAfter(anchor, trends);
  moveAfter(anchor, peer);

  tagSection(news, "NEWS / IR", "直近の開示と材料");
  tagSection(comments, "COMMUNITY", "投資家の反応");
  tagSection(earnings, "EARNINGS", "前回決算からの変化");
  tagSection(aiSummary, "AI SUMMARY", "決算の要点");
  tagSection(scoreReason, "SCORE", "評価の根拠");
  tagSection(signals, "SIGNALS", "財務上の強みと注意点");
  tagSection(proAnalysis, "PRO ANALYSIS", "詳細な判断材料");
  tagSection(peer, "COMPARISON", "比較すべき企業");

  normalizeSectionSpacing(root);
}

export default function CompanyPageOrderController() {
  const pathname = usePathname();
  const isCompanyPage = pathname?.startsWith("/company/");

  useEffect(() => {
    if (!isCompanyPage) return;

    reorderCompanyPage();
    const frame = window.requestAnimationFrame(reorderCompanyPage);

    return () => window.cancelAnimationFrame(frame);
  }, [isCompanyPage, pathname]);

  return null;
}
