"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import CompareButton from "./compare-button";

type Payload = {
  ticker: string;
  companyName: string;
};

export default function CompanyCompareFloatingButton() {
  const pathname = usePathname();
  const ticker = useMemo(() => pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null, [pathname]);
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    if (!ticker) {
      setPayload(null);
      return;
    }

    let cancelled = false;

    fetch(`/api/company/${ticker}/score-explanation`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Payload | null) => {
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!ticker || !payload) return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] right-3 z-40 sm:bottom-auto sm:left-6 sm:right-auto sm:top-24">
      <CompareButton ticker={payload.ticker} name={payload.companyName} />
    </div>
  );
}
