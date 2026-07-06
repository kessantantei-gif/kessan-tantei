"use client";

import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import WatchButton from "./watch-button";

function findTickerFromPath(pathname: string | null) {
  return pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null;
}

function findCompanyName() {
  return document.querySelector("h1")?.textContent?.trim() || "銘柄";
}

function removeLegacyWatchButtons() {
  document.querySelectorAll("[data-company-watchlist-button='true']").forEach((node) => node.remove());

  const buttons = Array.from(document.querySelectorAll("button"));
  for (const button of buttons) {
    const text = button.textContent?.replace(/\s+/g, "").trim() ?? "";
    if (text.includes("ウォッチリストに追加")) {
      const wrapper = button.closest("[data-company-watchlist-button='true']") || button.parentElement;
      if (wrapper && wrapper.childElementCount <= 1) wrapper.remove();
      else button.remove();
    }
  }
}

function alreadyHasOfficialWatchButton() {
  return Array.from(document.querySelectorAll("button")).some((button) => {
    const text = button.textContent?.replace(/\s+/g, "").trim() ?? "";
    return text === "☆ウォッチ" || text === "★ウォッチ中";
  });
}

function findHeroActionArea() {
  const h1 = document.querySelector("h1");
  const heroRow = h1?.closest("div")?.parentElement;
  const actionArea = heroRow?.querySelector("div.flex.shrink-0") as HTMLElement | null;
  if (actionArea) return actionArea;
  return h1?.parentElement as HTMLElement | null;
}

function markCompanyPage() {
  const main = document.querySelector("main") as HTMLElement | null;
  if (main) main.dataset.companyPage = "true";
}

export default function CompanyWatchlistInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => findTickerFromPath(pathname), [pathname]);

  useEffect(() => {
    if (!ticker) return;
    let observer: MutationObserver | null = null;

    const run = () => {
      markCompanyPage();
      removeLegacyWatchButtons();
      if (document.querySelector("[data-company-watch-button='true']")) return;
      if (alreadyHasOfficialWatchButton()) return;

      const target = findHeroActionArea();
      if (!target) return;

      const mount = document.createElement("div");
      mount.dataset.companyWatchButton = "true";
      mount.className = "flex shrink-0";
      target.insertAdjacentElement("afterbegin", mount);
      createRoot(mount).render(<WatchButton ticker={ticker} name={findCompanyName()} />);
    };

    run();
    requestAnimationFrame(run);
    window.setTimeout(run, 300);
    window.setTimeout(run, 900);

    observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer?.disconnect(), 2500);

    return () => observer?.disconnect();
  }, [ticker]);

  return null;
}
