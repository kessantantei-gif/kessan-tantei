"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

type Props = {
  marketSegment: string;
  marketLabel: string;
  industryName?: string | null;
};

const marketTones: Record<string, string> = {
  growth: "border-green-400/20 bg-green-500/10 text-green-200",
  standard: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200",
  prime: "border-violet-400/20 bg-violet-500/10 text-violet-200",
  other: "border-white/10 bg-white/5 text-slate-300",
};

function findIdentifierRow() {
  const overview = document.querySelector(
    "main[data-company-page='true'] [data-company-section='overview']"
  ) as HTMLElement | null;

  if (!overview) return null;

  const tickerBadge = Array.from(overview.querySelectorAll("span")).find(
    (node) => /^TSE:\s*/.test(node.textContent?.trim() ?? "")
  );

  return tickerBadge?.parentElement as HTMLElement | null;
}

export default function CompanyMarketBadges({
  marketSegment,
  marketLabel,
  industryName,
}: Props) {
  const pathname = usePathname();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame: number | null = null;
    let stopped = false;

    const mount = () => {
      frame = null;
      if (stopped) return;

      const row = findIdentifierRow();
      if (!row) return;

      let badgeHost = Array.from(row.children).find(
        (child) =>
          child instanceof HTMLElement &&
          child.dataset.companyMarketBadgesHost === "true"
      ) as HTMLElement | undefined;

      if (!badgeHost) {
        badgeHost = document.createElement("div");
        badgeHost.dataset.companyMarketBadgesHost = "true";
        badgeHost.className = "contents";
        row.appendChild(badgeHost);
      }

      setHost(badgeHost);
    };

    const schedule = () => {
      if (stopped || frame !== null) return;
      frame = window.requestAnimationFrame(mount);
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    const timers = [50, 200, 500, 1000].map((delay) =>
      window.setTimeout(schedule, delay)
    );

    return () => {
      stopped = true;
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      if (frame !== null) window.cancelAnimationFrame(frame);
      setHost(null);
      document
        .querySelectorAll("[data-company-market-badges-host='true']")
        .forEach((node) => node.remove());
    };
  }, [industryName, marketLabel, marketSegment, pathname]);

  if (!host) return null;

  const marketTone = marketTones[marketSegment] || marketTones.other;

  return createPortal(
    <>
      <span
        className={`rounded-full border px-3 py-1 text-xs font-bold sm:px-4 sm:text-sm ${marketTone}`}
      >
        {marketLabel}
      </span>
      {industryName ? (
        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-300 sm:px-4 sm:text-sm">
          {industryName}
        </span>
      ) : null}
    </>,
    host
  );
}
