"use client";

import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import CompareButton from "./compare-button";

function companyNameFromLink(link: HTMLAnchorElement) {
  const text = link.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return text.split(" ")[0] || link.href.split("/company/")[1]?.split("/")[0] || "銘柄";
}

function injectButtons() {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/company/"]'));

  for (const link of links) {
    const match = link.getAttribute("href")?.match(/^\/company\/([^/?#]+)/);
    const ticker = match?.[1];
    if (!ticker) continue;

    const parent = link.parentElement;
    if (!parent || parent.querySelector(`[data-ranking-compare-button="${ticker}"]`)) continue;

    const mount = document.createElement("div");
    mount.dataset.rankingCompareButton = ticker;
    mount.className = "mt-2";

    const card = link.closest("div.rounded-3xl, tr, li") as HTMLElement | null;
    const target = card ?? parent;
    target.append(mount);

    createRoot(mount).render(
      <CompareButton ticker={ticker} name={companyNameFromLink(link)} />
    );
  }
}

export default function RankingCompareInjector() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || (!pathname.startsWith("/ranking") && pathname !== "/")) return;

    injectButtons();
    requestAnimationFrame(injectButtons);
    window.setTimeout(injectButtons, 200);
    window.setTimeout(injectButtons, 800);

    const observer = new MutationObserver(injectButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 3000);

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
