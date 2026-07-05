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
    <div className="fixed right-4 top-20 z-40 sm:right-6 sm:top-24">
      <CompareButton ticker={payload.ticker} name={payload.companyName} />
    </div>
  );
}
