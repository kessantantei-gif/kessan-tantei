"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import styles from "./company-page-visual-enhancer.module.css";

function parseOkuValue(text: string | null | undefined) {
  if (!text) return 0;
  const match = text.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*億円/);
  return match ? Number(match[1]) : 0;
}

function getNewsCategory(title: string, summary: string) {
  const text = `${title} ${summary}`;

  if (/決算|業績|利益|売上|上方修正|下方修正|業績予想|赤字|黒字/.test(text)) {
    return "決算";
  }
  if (/配当|株主総会|自己株|有価証券|適時開示|IR|資本政策|増資/.test(text)) {
    return "IR";
  }
  if (/提携|受注|契約|導入|新製品|新サービス|開発|採用|出店/.test(text)) {
    return "事業";
  }

  return "ニュース";
}

function getSourceLabel(href: string) {
  try {
    const hostname = new URL(href).hostname.replace(/^www\./, "");
    const knownSources: Record<string, string> = {
      "prtimes.jp": "PR TIMES",
      "nikkei.com": "日本経済新聞",
      "kabutan.jp": "株探",
      "finance.yahoo.co.jp": "Yahoo!ファイナンス",
      "minkabu.jp": "みんかぶ",
      "tdnet-pdf.kabutan.jp": "適時開示",
    };

    return knownSources[hostname] ?? hostname;
  } catch {
    return "外部サイト";
  }
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

function enhanceCompanyNews() {
  const section = document.querySelector(
    "main[data-company-page='true'] [data-company-section='news']"
  );

  if (!(section instanceof HTMLElement)) return;

  const panel = section.firstElementChild;
  const heading = panel?.querySelector("h2");
  const content = heading?.nextElementSibling;
  const list = content?.querySelector(".space-y-4");

  if (!(panel instanceof HTMLElement) || !(content instanceof HTMLElement) || !(list instanceof HTMLElement)) {
    return;
  }

  panel.classList.add(styles.newsPanel);
  heading?.classList.add(styles.newsHeading);
  list.classList.add(styles.newsList);

  const cards = Array.from(list.children).filter(
    (card): card is HTMLAnchorElement => card instanceof HTMLAnchorElement
  );

  if (!content.querySelector("[data-news-toolbar='true']") && cards.length > 0) {
    const toolbar = document.createElement("div");
    toolbar.dataset.newsToolbar = "true";
    toolbar.className = styles.newsToolbar;
    toolbar.innerHTML = `
      <span class="${styles.newsCount}">最新${cards.length}件</span>
      <span class="${styles.newsSwipeHint}">横にスワイプして確認</span>
    `;
    content.insertBefore(toolbar, list);
  }

  cards.forEach((card, index) => {
    if (card.dataset.newsEnhanced === "true") return;
    card.dataset.newsEnhanced = "true";
    card.classList.add(styles.newsCard);

    if (index === 0) {
      card.classList.add(styles.newsCardLatest);
    }

    const date = card.children.item(0);
    const title = card.children.item(1);
    const summary = card.children.item(2);
    const titleText = title?.textContent?.trim() ?? "";
    const summaryText = summary?.textContent?.trim() ?? "";
    const category = getNewsCategory(titleText, summaryText);
    const source = getSourceLabel(card.href);

    const meta = document.createElement("div");
    meta.className = styles.newsMeta;

    const badges = document.createElement("div");
    badges.className = styles.newsBadges;

    if (index === 0) {
      const latest = document.createElement("span");
      latest.className = styles.newsLatestBadge;
      latest.textContent = "最新";
      badges.appendChild(latest);
    }

    const categoryBadge = document.createElement("span");
    categoryBadge.className = styles.newsCategoryBadge;
    categoryBadge.textContent = category;
    badges.appendChild(categoryBadge);
    meta.appendChild(badges);

    if (date instanceof HTMLElement) {
      date.classList.add(styles.newsDate);
      meta.appendChild(date);
    }

    card.insertBefore(meta, title ?? null);

    if (title instanceof HTMLElement) {
      title.classList.add(styles.newsTitle);
    }
    if (summary instanceof HTMLElement) {
      summary.classList.add(styles.newsSummary);
    }

    const footer = document.createElement("div");
    footer.className = styles.newsFooter;
    footer.innerHTML = `
      <span class="${styles.newsSource}">${source}</span>
      <span class="${styles.newsOpen}">記事を開く ↗</span>
    `;
    card.appendChild(footer);
  });
}

export default function CompanyPageVisualEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    let frame: number | null = null;
    let stopped = false;

    const enhance = () => {
      frame = null;
      if (stopped) return;
      enhanceTrendPanels();
      enhanceCompanyNews();
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
