"use client";

import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import CompareButton from "./compare-button";

type Payload = {
  ticker: string;
  companyName: string;
};

function findActionArea() {
  const watchButton = Array.from(document.querySelectorAll("button, a")).find((node) =>
    node.textContent?.includes("ウォッチ") || node.textContent?.includes("Watch")
  );

  const watchArea = watchButton?.closest("div.flex") as HTMLElement | null;
  if (watchArea) return watchArea;

  const h1 = document.querySelector("h1");
  const cardHeader = h1?.closest("div.rounded-3xl")?.querySelector("div.flex") as HTMLElement | null;
  if (cardHeader) return cardHeader;

  return h1?.parentElement ?? null;
}

export default function CompareButtonInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null, [pathname]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;

    fetch(`/api/company/${ticker}/score-explanation`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: Payload | null) => {
        if (cancelled || !payload) return;

        const run = () => {
          if (document.querySelector("[data-compare-button-injected='true']")) return;
          const area = findActionArea();
          if (!area) return;

          const mount = document.createElement("div");
          mount.dataset.compareButtonInjected = "true";
          mount.className = "shrink-0";
          area.prepend(mount);
          createRoot(mount).render(
            <CompareButton ticker={payload.ticker} name={payload.companyName} />
          );
        };

        run();
        requestAnimationFrame(run);
        window.setTimeout(run, 150);
        window.setTimeout(run, 600);

        observer = new MutationObserver(run);
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(() => observer?.disconnect(), 2500);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [ticker]);

  return null;
}
