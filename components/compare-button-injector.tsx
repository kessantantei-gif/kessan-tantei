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

  const area = watchButton?.closest("div.flex") as HTMLElement | null;
  return area;
}

export default function CompareButtonInjector() {
  const pathname = usePathname();
  const ticker = useMemo(() => pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null, [pathname]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;

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
          area.prepend(mount);
          createRoot(mount).render(
            <CompareButton ticker={payload.ticker} name={payload.companyName} />
          );
        };

        run();
        requestAnimationFrame(run);
        window.setTimeout(run, 150);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return null;
}
