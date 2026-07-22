"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import styles from "./company-page-visual-enhancer.module.css";

function parseOkuValue(text: string | null | undefined) {
  if (!text) return 0;
  const match = text.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*億円/);
  return match ? Number(match[1]) : 0;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function cleanNewsTitle(rawTitle: string) {
  const original = normalizeText(rawTitle);
  let title = original;

  title = title.replace(/^.+?\[\d{4}\]\s*[：:]\s*/, "");
  title = title.replace(
    /\s+\d{4}年\d{1,2}月\d{1,2}日(?:\([^)]*\))?\s*[：:].*$/,
    ""
  );
  title = title.replace(
    /\s*[：:]\s*(?:日経会社情報.*|日本経済新聞.*|PR TIMES.*|株探.*|Yahoo!ファイナンス.*|みんかぶ.*)$/i,
    ""
  );

  return title.trim() || original;
}

function cleanNewsSummary(rawSummary: string, rawTitle: string, cleanTitle: string) {
  let summary = normalizeText(rawSummary);
  const originalTitle = normalizeText(rawTitle);

  if (!summary) return "";

  if (originalTitle && summary.includes(originalTitle)) {
    summary = summary.replace(originalTitle, "");
  }
  if (cleanTitle && summary.startsWith(cleanTitle)) {
    summary = summary.slice(cleanTitle.length);
  }

  summary = summary
    .replace(/^[\s\-–—:：・|]+/, "")
    .replace(
      /(?:日経会社情報 DIGITAL|日本経済新聞|PR TIMES|株探|Yahoo!ファイナンス|みんかぶ).*$/i,
      ""
    )
    .trim();

  if (summary.length < 24 || summary === cleanTitle) return "";
  return summary;
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

function getSourceLabel(href: string, title: string) {
  if (/日本経済新聞|日経会社情報/.test(title)) return "日本経済新聞";
  if (/PR TIMES/i.test(title)) return "PR TIMES";
  if (/Yahoo!ファイナンス/i.test(title)) return "Yahoo!ファイナンス";
  if (/株探/.test(title)) return "株探";
  if (/みんかぶ/.test(title)) return "みんかぶ";

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

type OriginalNewsItem = {
  href: string;
  date: string;
  rawTitle: string;
  title: string;
  summary: string;
  category: string;
  source: string;
};

function createNewsCard(item: OriginalNewsItem, index: number) {
  const card = document.createElement("a");
  card.href = item.href;
  card.target = "_blank";
  card.rel = "noreferrer";
  card.dataset.pressable = "true";
  card.className = `${styles.newsCard}${
    index === 0 ? ` ${styles.newsCardLatest}` : ""
  }`;
  card.setAttribute("aria-label", `${item.title}を外部サイトで開く`);

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

  const category = document.createElement("span");
  category.className = styles.newsCategoryBadge;
  category.textContent = item.category;
  badges.appendChild(category);

  const date = document.createElement("time");
  date.className = styles.newsDate;
  date.textContent = item.date;

  meta.append(badges, date);

  const title = document.createElement("p");
  title.className = styles.newsTitle;
  title.textContent = item.title;

  card.append(meta, title);

  if (item.summary) {
    const summary = document.createElement("p");
    summary.className = styles.newsSummary;
    summary.textContent = item.summary;
    card.appendChild(summary);
  }

  const footer = document.createElement("div");
  footer.className = styles.newsFooter;

  const source = document.createElement("span");
  source.className = styles.newsSource;
  source.textContent = item.source;

  const open = document.createElement("span");
  open.className = styles.newsOpen;
  open.textContent = "記事を読む ↗";

  footer.append(source, open);
  card.appendChild(footer);

  return card;
}

function enhanceCompanyNews() {
  const section = document.querySelector(
    "main[data-company-page='true'] [data-company-section='news']"
  );

  if (!(section instanceof HTMLElement)) return;

  const panel = section.firstElementChild;
  const heading = panel?.querySelector("h2");
  const content = heading?.nextElementSibling;

  if (!(panel instanceof HTMLElement) || !(content instanceof HTMLElement)) return;
  if (content.querySelector("[data-news-carousel='true']")) return;

  const originalList = content.querySelector(".space-y-4");
  if (!(originalList instanceof HTMLElement)) return;

  const originalCards = Array.from(originalList.children).filter(
    (card): card is HTMLAnchorElement => card instanceof HTMLAnchorElement
  );
  if (originalCards.length === 0) return;

  const items = originalCards.map((card) => {
    const date = normalizeText(card.children.item(0)?.textContent);
    const rawTitle = normalizeText(card.children.item(1)?.textContent);
    const rawSummary = normalizeText(card.children.item(2)?.textContent);
    const title = cleanNewsTitle(rawTitle);
    const summary = cleanNewsSummary(rawSummary, rawTitle, title);

    return {
      href: card.href,
      date,
      rawTitle,
      title,
      summary,
      category: getNewsCategory(title, summary),
      source: getSourceLabel(card.href, rawTitle),
    } satisfies OriginalNewsItem;
  });

  panel.classList.add(styles.newsPanel);
  heading?.classList.add(styles.newsHeading);

  const toolbar = document.createElement("div");
  toolbar.className = styles.newsToolbar;

  const count = document.createElement("span");
  count.className = styles.newsCount;
  count.textContent = `最新${items.length}件`;

  const hint = document.createElement("span");
  hint.className = styles.newsSwipeHint;
  hint.textContent = "1枚ずつ横にスワイプ";

  toolbar.append(count, hint);

  const carousel = document.createElement("div");
  carousel.dataset.newsCarousel = "true";
  carousel.className = styles.newsList;
  carousel.setAttribute("role", "list");
  carousel.setAttribute("aria-label", "会社ニュース一覧");

  items.forEach((item, index) => {
    const card = createNewsCard(item, index);
    card.setAttribute("role", "listitem");
    carousel.appendChild(card);
  });

  content.replaceChildren(toolbar, carousel);
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
