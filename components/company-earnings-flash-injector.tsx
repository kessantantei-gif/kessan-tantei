"use client";

import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import CompanyEarningsFlash from "./company-earnings-flash";

function findInsertTarget() {
  const peer = document.querySelector("[data-company-peer-comparison='true']") as HTMLElement | null;
  if (peer) return peer;

  const ai = document.querySelector("[data-company-ai-summary='true']") as HTMLElement | null;
  if (ai) return ai;

  const h1 = document.querySelector("h1");
  return h1?.closest("div.rounded-3xl") as HTMLElement | null;
}

export default function CompanyEarningsFlashInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null, [pathname]);

  useEffect(() => {
    if (!ticker) return;
    let observer: MutationObserver | null = null;

    const run = () => {
      if (document.querySelector("[data-company-earnings-flash='true']")) return;
      const target = findInsertTarget();
      if (!target || !target.parentElement) return;

      const mount = document.createElement("div");
      mount.dataset.companyEarningsFlash = "true";
      target.insertAdjacentElement("afterend", mount);
      createRoot(mount).render(<CompanyEarningsFlash ticker={ticker} />);
    };

    run();
    requestAnimationFrame(run);
    window.setTimeout(run, 400);
    window.setTimeout(run, 1100);

    observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer?.disconnect(), 4000);

    return () => observer?.disconnect();
  }, [ticker]);

  return null;
}
