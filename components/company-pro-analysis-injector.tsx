"use client";

import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import CompanyProAnalysis from "./company-pro-analysis";

function findInsertTarget() {
  const earnings = document.querySelector("[data-company-earnings-flash='true']") as HTMLElement | null;
  if (earnings) return earnings;

  const peer = document.querySelector("[data-company-peer-comparison='true']") as HTMLElement | null;
  if (peer) return peer;

  const signals = document.querySelector("[data-company-financial-signals='true']") as HTMLElement | null;
  if (signals) return signals;

  const ai = document.querySelector("[data-company-ai-summary='true']") as HTMLElement | null;
  if (ai) return ai;

  const h1 = document.querySelector("h1");
  return h1?.closest("div.rounded-3xl") as HTMLElement | null;
}

export default function CompanyProAnalysisInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null, [pathname]);

  useEffect(() => {
    if (!ticker) return;
    let observer: MutationObserver | null = null;

    const run = () => {
      if (document.querySelector("[data-company-pro-analysis='true']")) return;
      const target = findInsertTarget();
      if (!target || !target.parentElement) return;

      const mount = document.createElement("div");
      mount.dataset.companyProAnalysis = "true";
      target.insertAdjacentElement("afterend", mount);
      createRoot(mount).render(<CompanyProAnalysis ticker={ticker} />);
    };

    run();
    requestAnimationFrame(run);
    window.setTimeout(run, 500);
    window.setTimeout(run, 1200);

    observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer?.disconnect(), 4500);

    return () => observer?.disconnect();
  }, [ticker]);

  return null;
}
