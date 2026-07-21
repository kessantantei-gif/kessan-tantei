"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

type Props = {
  ticker: string;
  marketSegment: string;
  marketLabel: string;
  industryName?: string | null;
};

type MarketTone = {
  card: string;
  text: string;
  dot: string;
};

const marketTones: Record<string, MarketTone> = {
  growth: {
    card: "border-green-400/30 bg-green-500/10",
    text: "text-green-200",
    dot: "bg-green-300",
  },
  standard: {
    card: "border-cyan-400/30 bg-cyan-500/10",
    text: "text-cyan-200",
    dot: "bg-cyan-300",
  },
  prime: {
    card: "border-violet-400/30 bg-violet-500/10",
    text: "text-violet-200",
    dot: "bg-violet-300",
  },
  other: {
    card: "border-white/15 bg-white/5",
    text: "text-slate-200",
    dot: "bg-slate-300",
  },
};

function findOverviewRows() {
  const overview = document.querySelector(
    "main[data-company-page='true'] [data-company-section='overview']"
  ) as HTMLElement | null;

  if (!overview) return null;

  const tickerBadge = Array.from(overview.querySelectorAll("span")).find(
    (node) => /^TSE:\s*/.test(node.textContent?.trim() ?? "")
  );
  const identifierRow = tickerBadge?.parentElement as HTMLElement | null;
  const signalRow = identifierRow?.nextElementSibling as HTMLElement | null;

  if (!identifierRow || !signalRow) return null;

  return { identifierRow, signalRow };
}

export default function CompanyMarketBadges({
  ticker,
  marketSegment,
  marketLabel,
  industryName,
}: Props) {
  const pathname = usePathname();
  const [marketHost, setMarketHost] = useState<HTMLElement | null>(null);
  const [signalHost, setSignalHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame: number | null = null;
    let stopped = false;

    const mount = () => {
      frame = null;
      if (stopped) return;

      const rows = findOverviewRows();
      if (!rows) return;

      const { identifierRow, signalRow } = rows;

      let nextMarketHost = identifierRow.querySelector(
        ":scope > [data-company-market-summary-host='true']"
      ) as HTMLElement | null;

      if (!nextMarketHost) {
        nextMarketHost = document.createElement("div");
        nextMarketHost.dataset.companyMarketSummaryHost = "true";
        nextMarketHost.className = "w-full";
        identifierRow.appendChild(nextMarketHost);
      }

      Array.from(identifierRow.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === nextMarketHost) return;
        child.dataset.companyMetadataHidden = "true";
        child.style.display = "none";
      });

      identifierRow.dataset.companyMarketSummaryRow = "true";
      identifierRow.classList.add("w-full");

      let nextSignalHost = signalRow.querySelector(
        ":scope > [data-company-signal-heading-host='true']"
      ) as HTMLElement | null;

      if (!nextSignalHost) {
        nextSignalHost = document.createElement("div");
        nextSignalHost.dataset.companySignalHeadingHost = "true";
        nextSignalHost.className = "w-full";
        signalRow.insertBefore(nextSignalHost, signalRow.firstChild);
      }

      signalRow.dataset.companySignalRow = "true";
      signalRow.classList.add(
        "items-center",
        "rounded-2xl",
        "border",
        "border-white/10",
        "bg-black/20",
        "p-3"
      );

      setMarketHost(nextMarketHost);
      setSignalHost(nextSignalHost);
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

      document
        .querySelectorAll("[data-company-metadata-hidden='true']")
        .forEach((node) => {
          if (node instanceof HTMLElement) {
            node.style.removeProperty("display");
            delete node.dataset.companyMetadataHidden;
          }
        });

      document
        .querySelectorAll(
          "[data-company-market-summary-host='true'], [data-company-signal-heading-host='true']"
        )
        .forEach((node) => node.remove());

      setMarketHost(null);
      setSignalHost(null);
    };
  }, [industryName, marketLabel, marketSegment, pathname, ticker]);

  const tone = marketTones[marketSegment] || marketTones.other;

  return (
    <>
      {marketHost
        ? createPortal(
            <div className={`w-full rounded-2xl border p-3 sm:p-4 ${tone.card}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black tracking-[0.2em] text-slate-400">
                    上場市場
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                    <p className={`text-lg font-black sm:text-xl ${tone.text}`}>
                      {marketLabel}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                  <p className="text-[9px] font-bold tracking-wider text-slate-500">
                    証券コード
                  </p>
                  <p className="mt-0.5 text-sm font-black text-white">{ticker}</p>
                </div>
              </div>

              {industryName ? (
                <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3">
                  <span className="shrink-0 text-[10px] font-black tracking-wider text-slate-500">
                    業種
                  </span>
                  <strong className="min-w-0 text-sm text-slate-200">
                    {industryName}
                  </strong>
                </div>
              ) : null}
            </div>,
            marketHost
          )
        : null}

      {signalHost
        ? createPortal(
            <div className="mb-1 flex w-full items-center justify-between gap-3">
              <p className="text-[10px] font-black tracking-[0.2em] text-slate-400">
                財務シグナル
              </p>
              <span className="text-[10px] text-slate-500">直近決算</span>
            </div>,
            signalHost
          )
        : null}
    </>
  );
}
