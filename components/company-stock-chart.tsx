"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Spinner from "@/components/spinner";

type LoadState = "idle" | "loading" | "ready" | "error";

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
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const [requested, setRequested] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!requested || !widgetContainerRef.current) return;

    const container = widgetContainerRef.current;
    container.replaceChildren();
    setLoadState("loading");

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    container.appendChild(widget);

    const observer = new MutationObserver(() => {
      if (container.querySelector("iframe")) {
        setLoadState("ready");
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol: `TSE:${ticker}`,
      interval: "D",
      timezone: "Asia/Tokyo",
      theme: "dark",
      style: "1",
      locale: "ja",
      backgroundColor: "#070b17",
      gridColor: "rgba(148, 163, 184, 0.08)",
      allow_symbol_change: false,
      calendar: false,
      details: false,
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hotlist: false,
      save_image: false,
      withdateranges: true,
      watchlist: [],
      compareSymbols: [],
      studies: [],
    });
    script.onerror = () => setLoadState("error");
    container.appendChild(script);

    const timeout = window.setTimeout(() => {
      if (!container.querySelector("iframe")) {
        setLoadState("error");
      }
    }, 15000);

    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      container.replaceChildren();
    };
  }, [attempt, requested, ticker]);

  const tradingViewUrl = `https://www.tradingview.com/symbols/TSE-${encodeURIComponent(
    ticker
  )}/?utm_source=kessan-tantei.jp&utm_medium=widget&utm_campaign=chart`;

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

        <span className="w-fit rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-200">
          遅延表示の場合あり
        </span>
      </div>

      {!requested ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center sm:py-10">
          <p className="text-sm leading-6 text-slate-400">
            ページ速度を保つため、チャートは必要なときだけ読み込みます。
          </p>
          <button
            type="button"
            data-pressable="true"
            onClick={() => setRequested(true)}
            className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-green-300/50 bg-green-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-green-500/20 transition hover:bg-green-300"
          >
            株価チャートを表示する
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            押すとTradingViewの外部コンテンツを読み込みます。
          </p>
        </div>
      ) : (
        <>
          <div className="relative mt-5 h-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[#070b17] sm:h-[560px]">
            <div
              ref={widgetContainerRef}
              className={`tradingview-widget-container h-full w-full ${
                loadState === "error" ? "invisible" : ""
              }`}
            />

            {loadState === "loading" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#070b17] text-green-200">
                <span className="scale-125">
                  <Spinner />
                </span>
                <p className="text-sm font-bold">株価チャートを読み込んでいます...</p>
              </div>
            ) : null}

            {loadState === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#070b17] px-6 text-center">
                <p className="font-black text-white">チャートを読み込めませんでした</p>
                <p className="text-sm leading-6 text-slate-400">
                  通信状況またはTradingView側の状態をご確認ください。
                </p>
                <button
                  type="button"
                  data-pressable="true"
                  onClick={() => setAttempt((current) => current + 1)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-black text-white transition hover:bg-white/15"
                >
                  再読み込み
                </button>
              </div>
            ) : null}
          </div>

          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            <a
              href={tradingViewUrl}
              target="_blank"
              rel="noopener nofollow noreferrer"
              className="font-bold text-sky-300 underline decoration-sky-300/40 underline-offset-4 hover:text-sky-200"
            >
              TSE:{ticker} chart
            </a>{" "}
            by TradingView。取引所の規定によりデータが遅延する場合があります。
          </p>
        </>
      )}
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
