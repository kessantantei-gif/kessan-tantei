"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import styles from "./company-page-visual-enhancer.module.css";

function parseOkuValue(text: string | null | undefined) {
  if (!text) return 0;
  const match = text.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*億円/);
  return match ? Number(match[1]) : 0;
}

function enhanceTrendPanels() {
  const section = document.querySelector(
    "main[data-company-page='true'] [data-company-section='financial-trends']"
  );

  if (!(section instanceof HTMLElement)) return;

  Array.from(section.children).forEach((panel) => {
    if (!(panel instanceof HTMLElement)) return;

    const heading = panel.querySelector("h2");
    const content = heading?.nextElementSibling;
    const rowsContainer = content?.querySelector(".space-y-3");

    if (!(content instanceof HTMLElement) || !(rowsContainer instanceof HTMLElement)) {
      return;
    }

    panel.classList.add(styles.trendPanel);
    heading?.classList.add(styles.trendTitle);
    rowsContainer.classList.add(styles.trendRows);

    if (!content.querySelector("[data-trend-scale-note='true']")) {
      const note = document.createElement("div");
      note.dataset.trendScaleNote = "true";
      note.className = styles.trendLegend;
      note.innerHTML = `
        <span>各期を同一指標内で比較</span>
        <span class="${styles.trendLegendKeys}">
          <i class="${styles.legendPositive}"></i>プラス
          <i class="${styles.legendNegative}"></i>マイナス
        </span>
      `;
      content.insertBefore(note, rowsContainer);
    }

    const rows = Array.from(rowsContainer.children).filter(
      (row): row is HTMLElement => row instanceof HTMLElement
    );
    const values = rows.map((row) => {
      const header = row.firstElementChild;
      const valueElement = header?.lastElementChild;
      return parseOkuValue(valueElement?.textContent);
    });
    const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 0);

    rows.forEach((row, index) => {
      const header = row.firstElementChild;
      const track = row.children.item(1);
      const bar = track?.firstElementChild;
      const value = values[index] ?? 0;
      const width =
        value === 0 || maxAbs === 0
          ? 0
          : Math.max(10, Math.min(100, (Math.abs(value) / maxAbs) * 100));

      row.classList.add(styles.trendRow);
      if (index === rows.length - 1) {
        row.classList.add(styles.trendRowLatest);
      }

      if (header instanceof HTMLElement) {
        header.classList.add(styles.trendHeader);
        const period = header.firstElementChild;
        const valueElement = header.lastElementChild;
        valueElement?.classList.add(
          styles.trendValue,
          value < 0 ? styles.trendValueNegative : styles.trendValuePositive
        );

        if (
          index === rows.length - 1 &&
          period instanceof HTMLElement &&
          !period.querySelector("[data-latest-period='true']")
        ) {
          const latest = document.createElement("span");
          latest.dataset.latestPeriod = "true";
          latest.className = styles.latestBadge;
          latest.textContent = "最新";
          period.appendChild(latest);
        }
      }

      if (track instanceof HTMLElement) {
        track.classList.add(styles.trendTrack);
      }

      if (bar instanceof HTMLElement) {
        bar.classList.add(
          styles.trendBar,
          value < 0 ? styles.trendBarNegative : styles.trendBarPositive
        );
        bar.style.width = `${width}%`;
        bar.setAttribute(
          "aria-label",
          `${value < 0 ? "マイナス" : "プラス"} ${Math.abs(value).toFixed(2)}億円`
        );
      }
    });
  });
}

export default function CompanyPageVisualEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    let frame: number | null = null;
    let stopped = false;

    const enhance = () => {
      frame = null;
      if (!stopped) enhanceTrendPanels();
    };

    const schedule = () => {
      if (stopped || frame !== null) return;
      frame = window.requestAnimationFrame(enhance);
    };

    schedule();
    const timers = [50, 200, 500, 1000].map((delay) =>
      window.setTimeout(schedule, delay)
    );
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      stopped = true;
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
