"use client";

import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import CompanyFinancialSignals from "./company-financial-signals";

function findInsertTarget() {
  const ai = document.querySelector("[data-company-ai-summary='true']") as HTMLElement | null;
  if (ai) return ai;

  const scoreExplanation = document.querySelector("[data-score-explanation='true']") as HTMLElement | null;
  if (scoreExplanation) return scoreExplanation;

  const h1 = document.querySelector("h1");
  const heroCard = h1?.closest("div.rounded-3xl") as HTMLElement | null;
  return heroCard?.parentElement as HTMLElement | null;
}

export default function CompanyFinancialSignalsInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null, [pathname]);

  useEffect(() => {
    if (!ticker) return;
    let observer: MutationObserver | null = null;

    const run = () => {
      if (document.querySelector("[data-company-financial-signals='true']")) return;
      const target = findInsertTarget();
      if (!target || !target.parentElement) return;

      const mount = document.createElement("div");
      mount.dataset.companyFinancialSignals = "true";
      target.insertAdjacentElement("afterend", mount);
      createRoot(mount).render(<CompanyFinancialSignals ticker={ticker} />);
    };

    run();
    requestAnimationFrame(run);
    window.setTimeout(run, 300);
    window.setTimeout(run, 900);

    observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer?.disconnect(), 3500);

    return () => observer?.disconnect();
  }, [ticker]);

  return null;
}
