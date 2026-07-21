"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

function companyTicker(pathname: string | null) {
  if (!pathname?.startsWith("/company/")) return null;

  const rawTicker = pathname.split("/").filter(Boolean).at(-1);
  if (!rawTicker) return null;

  try {
    const ticker = decodeURIComponent(rawTicker).trim().toUpperCase();
    return /^[A-Z0-9]{4,6}$/.test(ticker) ? ticker : null;
  } catch {
    return null;
  }
}

function companyContentRoot() {
  const main = document.querySelector(
    "main[data-company-page='true']"
  ) as HTMLElement | null;

  if (!main) return null;

  return (
    Array.from(main.children).find(
      (child) => child.tagName.toLowerCase() === "section"
    ) as HTMLElement | undefined
  ) ?? null;
}

function StockChartPanel({ ticker }: { ticker: string }) {
  const tradingViewUrl = `https://www.tradingview.com/symbols/TSE-${encodeURIComponent(
    ticker
  )}/?utm_source=kessan-tantei.jp&utm_medium=referral&utm_campaign=company-chart`;

  return (
    <section className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] tracking-[0.24em] text-green-300 sm:text-sm">
            STOCK PRICE CHART
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">株価チャート</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            TSE:{ticker} の株価推移をTradingViewで確認できます。
          </p>
        </div>

        <span className="w-fit rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-200">
          外部サイト
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-5">
        <div className="min-w-0">
          <p className="font-black text-white">TSE:{ticker} の株価チャートを見る</p>
          <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm sm:leading-6">
            東証銘柄はTradingViewの埋め込み表示に対応していないため、外部ページで表示します。
          </p>
        </div>

        <a
          href={tradingViewUrl}
          target="_blank"
          rel="noopener nofollow noreferrer"
          data-pressable="true"
          className="mt-4 inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full border border-green-300/60 bg-green-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-green-500/20 transition hover:bg-green-300 active:translate-y-0.5 active:scale-[0.98] active:bg-green-500 sm:mt-0 sm:w-auto"
        >
          TradingViewで見る
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        新しいタブで開きます。取引所の規定により株価データが遅延する場合があります。
      </p>
    </section>
  );
}

export default function CompanyStockChart() {
  const pathname = usePathname();
  const ticker = companyTicker(pathname);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!ticker) {
      setHost(null);
      return;
    }

    let frame: number | null = null;
    let stopped = false;

    const mount = () => {
      frame = null;
      if (stopped) return;

      const root = companyContentRoot();
      const overview = root?.querySelector(
        "[data-company-section='overview']"
      ) as HTMLElement | null;

      if (!root || !overview) return;

      let chartHost = root.querySelector(
        "[data-company-stock-chart-host='true']"
      ) as HTMLElement | null;

      if (!chartHost) {
        chartHost = document.createElement("div");
        chartHost.dataset.companyStockChartHost = "true";
        chartHost.dataset.companySection = "stock-chart";
        chartHost.className = "mt-4 min-w-0";
      }

      if (overview.nextElementSibling !== chartHost) {
        overview.insertAdjacentElement("afterend", chartHost);
      }

      setHost(chartHost);
    };

    const schedule = () => {
      if (stopped || frame !== null) return;
      frame = window.requestAnimationFrame(mount);
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    const timers = [50, 200, 500, 1000, 2000].map((delay) =>
      window.setTimeout(schedule, delay)
    );

    return () => {
      stopped = true;
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      if (frame !== null) window.cancelAnimationFrame(frame);
      setHost(null);
      document
        .querySelectorAll("[data-company-stock-chart-host='true']")
        .forEach((node) => node.remove());
    };
  }, [pathname, ticker]);

  if (!ticker || !host) return null;

  return createPortal(<StockChartPanel ticker={ticker} />, host);
}
