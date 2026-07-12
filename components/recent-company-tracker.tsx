"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordRecentCompany } from "@/lib/recent-companies";

function tickerFromPath(pathname: string | null) {
  return pathname?.match(/^\/company\/([^/]+)/)?.[1] ?? null;
}

function companyNameFromPage(ticker: string) {
  const heading = document.querySelector("main h1")?.textContent?.trim();
  if (!heading) return ticker;
  return heading.replace(/\s+/g, " ").trim();
}

export default function RecentCompanyTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const ticker = tickerFromPath(pathname);
    if (!ticker) return;

    const record = () =>
      recordRecentCompany(ticker, companyNameFromPage(ticker));

    record();
    const timer = window.setTimeout(record, 500);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
