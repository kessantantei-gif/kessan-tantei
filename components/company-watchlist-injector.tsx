"use client";

import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import WatchlistButton from "./watchlist-button";

function findCompanyName() {
  const h1 = document.querySelector("h1");
  const text = h1?.textContent?.trim();
  return text || "銘柄";
}

function findInsertTarget() {
  const h1 = document.querySelector("h1");
  return h1?.parentElement as HTMLElement | null;
}

export default function CompanyWatchlistInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null, [pathname]);

  useEffect(() => {
    if (!ticker) return;
    let observer: MutationObserver | null = null;

    const run = () => {
      if (document.querySelector("[data-company-watchlist-button='true']")) return;
      const target = findInsertTarget();
      if (!target) return;

      const mount = document.createElement("div");
      mount.dataset.companyWatchlistButton = "true";
      mount.className = "mt-4 flex flex-wrap gap-2";
      target.appendChild(mount);
      createRoot(mount).render(<WatchlistButton ticker={ticker} name={findCompanyName()} />);
    };

    run();
    requestAnimationFrame(run);
    window.setTimeout(run, 300);

    observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer?.disconnect(), 3000);

    return () => observer?.disconnect();
  }, [ticker]);

  return null;
}
