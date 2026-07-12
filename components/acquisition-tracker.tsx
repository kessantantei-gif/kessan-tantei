"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const storageKey = "kessan_acquisition";
const anonymousKey = "kessan_anonymous_id";
const sessionKey = "kessan_session_id";

function id() {
  return crypto.randomUUID();
}

function readOrCreate(key: string) {
  const current = sessionStorage.getItem(key) || localStorage.getItem(key);
  if (current) return current;
  const value = id();
  if (key === sessionKey) sessionStorage.setItem(key, value);
  else localStorage.setItem(key, value);
  return value;
}

function cookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=7776000; samesite=lax`;
}

export default function AcquisitionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;

    const existing = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, string>;
    const current = {
      utmSource: searchParams.get("utm_source") || existing.utmSource || "",
      utmMedium: searchParams.get("utm_medium") || existing.utmMedium || "",
      utmCampaign: searchParams.get("utm_campaign") || existing.utmCampaign || "",
      utmContent: searchParams.get("utm_content") || existing.utmContent || "",
      referrer: existing.referrer || document.referrer || "",
    };

    if (searchParams.get("utm_source") || !localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, JSON.stringify(current));
    }

    cookie("kt_utm_source", current.utmSource);
    cookie("kt_utm_medium", current.utmMedium);
    cookie("kt_utm_campaign", current.utmCampaign);
    cookie("kt_utm_content", current.utmContent);
    cookie("kt_referrer", current.referrer);

    const payload = {
      eventName: pathname === "/pricing" ? "pricing_view" : "page_view",
      path: pathname,
      anonymousId: readOrCreate(anonymousKey),
      sessionId: readOrCreate(sessionKey),
      ...current,
    };

    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest("a[href='/pricing']") as HTMLAnchorElement | null;
      if (!link) return;

      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, eventName: "pricing_click", metadata: { from: pathname } }),
        keepalive: true,
      });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname, searchParams]);

  return null;
}
