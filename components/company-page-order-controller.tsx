"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function companyRoot() {
  const main = document.querySelector(
    "main[data-company-page='true']"
  ) as HTMLElement | null;

  if (!main) return null;

  return (
    Array.from(main.children).find(
      (child) => child.tagName.toLowerCase() === "section"
    ) as HTMLElement | undefined
  ) ?? null;
}

function textOf(node: Element | null) {
  return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function findHeroGrid(root: HTMLElement) {
  const h1 = root.querySelector("h1");
  const heroCard = h1?.closest("div.rounded-3xl") as HTMLElement | null;
  return heroCard?.parentElement as HTMLElement | null;
}

function findSectionCard(root: HTMLElement, titles: string[]) {
  const heading = Array.from(root.querySelectorAll("h2")).find((node) =>
    titles.some((title) => textOf(node).includes(title))
  );

  if (!heading) return null;

  const card = heading.closest(
    "div.rounded-3xl, section.rounded-3xl"
  ) as HTMLElement | null;

  return card && root.contains(card) ? card : null;
}

function reorderPrimarySections() {
  const root = companyRoot();
  if (!root) return false;

  const hero = findHeroGrid(root);
  const news = findSectionCard(root, [
    "ニュース / IR要約",
    "ニュース",
    "IR要約",
  ]);
  const board = findSectionCard(root, ["みんなのコメント", "掲示板"]);

  if (!hero || !news || !board) return false;

  news.classList.add("w-full", "min-w-0");
  board.classList.add("w-full", "min-w-0");
  news.dataset.companyPrimarySection = "news";
  board.dataset.companyPrimarySection = "board";

  if (hero.nextElementSibling !== news) {
    hero.insertAdjacentElement("afterend", news);
  }

  if (news.nextElementSibling !== board) {
    news.insertAdjacentElement("afterend", board);
  }

  return hero.nextElementSibling === news && news.nextElementSibling === board;
}

export default function CompanyPageOrderController() {
  const pathname = usePathname();
  const isCompanyPage = pathname?.startsWith("/company/");

  useEffect(() => {
    if (!isCompanyPage) return;

    let frame: number | null = null;
    let stopped = false;

    const run = () => {
      frame = null;
      if (!stopped) reorderPrimarySections();
    };

    const schedule = () => {
      if (stopped || frame !== null) return;
      frame = window.requestAnimationFrame(run);
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const timers = [50, 200, 500, 1000, 2000, 4000, 7000].map((delay) =>
      window.setTimeout(schedule, delay)
    );

    const stopTimer = window.setTimeout(() => {
      stopped = true;
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    }, 10000);

    return () => {
      stopped = true;
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(stopTimer);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [isCompanyPage, pathname]);

  return null;
}
