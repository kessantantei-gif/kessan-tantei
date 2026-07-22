"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import CompanyNewsCarousel, {
  type CompanyNewsItem,
} from "./company-news-carousel";
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

  title = title.replace(
    /^.+?[（(]\d{4}[A-Z]?[）)]\s*[、,:：\-–—]\s*/,
    ""
  );
  title = title.replace(/^.+?\[\d{4}[A-Z]?]\s*[、,:：\-–—]\s*/, "");
  title = title.replace(
    /\s+\d{4}年\d{1,2}月\d{1,2}日(?:\([^)]*\))?\s*[：:].*$/,
    ""
  );
  title = title.replace(
    /\s*(?:[-–—|｜]\s*)?(?:ログミー\s*Finance|日経会社情報\s*DIGITAL|日本経済新聞|PR TIMES|株探|Yahoo!ファイナンス|みんかぶ)\s*$/i,
    ""
  );

  return title.trim() || original;
}

function characterOverlap(left: string, right: string) {
  const leftSet = new Set(left.replace(/[\s、。・,:：()（）\[\]【】\-–—]/g, ""));
  const rightSet = new Set(right.replace(/[\s、。・,:：()（）\[\]【】\-–—]/g, ""));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let common = 0;
  leftSet.forEach((character) => {
    if (rightSet.has(character)) common += 1;
  });

  return common / Math.min(leftSet.size, rightSet.size);
}

function cleanNewsSummary(rawSummary: string, rawTitle: string, title: string) {
  let summary = normalizeText(rawSummary);
  const originalTitle = normalizeText(rawTitle);

  if (!summary) return "";

  if (originalTitle && summary.includes(originalTitle)) {
    summary = summary.replace(originalTitle, "");
  }
  if (title && summary.startsWith(title)) {
    summary = summary.slice(title.length);
  }

  summary = summary
    .replace(/^[\s\-–—:：・|｜]+/, "")
    .replace(
      /\s*(?:[-–—|｜]\s*)?(?:ログミー\s*Finance|日経会社情報\s*DIGITAL|日本経済新聞|PR TIMES|株探|Yahoo!ファイナンス|みんかぶ).*$/i,
      ""
    )
    .trim();

  if (summary.length < 28) return "";
  if (summary.includes(title) || title.includes(summary)) return "";
  if (characterOverlap(title, summary) >= 0.72) return "";

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

function getSourceLabel(href: string, rawTitle: string) {
  if (/ログミー\s*Finance/i.test(rawTitle)) return "ログミーFinance";
  if (/日本経済新聞|日経会社情報/.test(rawTitle)) return "日本経済新聞";
  if (/PR TIMES/i.test(rawTitle)) return "PR TIMES";
  if (/Yahoo!ファイナンス/i.test(rawTitle)) return "Yahoo!ファイナンス";
  if (/株探/.test(rawTitle)) return "株探";
  if (/みんかぶ/.test(rawTitle)) return "みんかぶ";

  try {
    const hostname = new URL(href).hostname.replace(/^www\./, "");
    const knownSources: Record<string, string> = {
      "prtimes.jp": "PR TIMES",
      "nikkei.com": "日本経済新聞",
      "kabutan.jp": "株探",
      "finance.yahoo.co.jp": "Yahoo!ファイナンス",
      "minkabu.jp": "みんかぶ",
      "logmi.jp": "ログミーFinance",
      "finance.logmi.jp": "ログミーFinance",
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

type NewsPortal = {
  host: HTMLElement;
  items: CompanyNewsItem[];
};

function prepareNewsPortal(): {
  portal: NewsPortal;
  cleanup: () => void;
} | null {
  const section = document.querySelector(
    "main[data-company-page='true'] [data-company-section='news']"
  );
  if (!(section instanceof HTMLElement)) return null;

  const panel = section.firstElementChild;
  const heading = panel?.querySelector("h2");
  const content = heading?.nextElementSibling;
  const originalList = content?.querySelector(".space-y-4");

  if (!(content instanceof HTMLElement) || !(originalList instanceof HTMLElement)) {
    return null;
  }

  const originalCards = Array.from(originalList.children).filter(
    (card): card is HTMLAnchorElement => card instanceof HTMLAnchorElement
  );
  if (originalCards.length === 0) return null;

  const items = originalCards.map((card) => {
    const date = normalizeText(card.children.item(0)?.textContent);
    const rawTitle = normalizeText(card.children.item(1)?.textContent);
    const rawSummary = normalizeText(card.children.item(2)?.textContent);
    const title = cleanNewsTitle(rawTitle);
    const summary = cleanNewsSummary(rawSummary, rawTitle, title);

    return {
      href: card.href,
      date,
      title,
      summary,
      category: getNewsCategory(title, summary),
      source: getSourceLabel(card.href, rawTitle),
    } satisfies CompanyNewsItem;
  });

  const oldGeneratedCarousel = content.querySelector("[data-news-carousel='true']");
  oldGeneratedCarousel?.remove();

  let host = content.querySelector(
    "[data-company-news-react-host='true']"
  ) as HTMLElement | null;
  if (!host) {
    host = document.createElement("div");
    host.dataset.companyNewsReactHost = "true";
    content.appendChild(host);
  }

  originalList.hidden = true;
  originalList.style.setProperty("display", "none", "important");
  originalList.setAttribute("aria-hidden", "true");

  return {
    portal: { host, items },
    cleanup: () => {
      originalList.hidden = false;
      originalList.style.removeProperty("display");
      originalList.removeAttribute("aria-hidden");
      host?.remove();
    },
  };
}

export default function CompanyPageVisualEnhancer() {
  const pathname = usePathname();
  const [newsPortal, setNewsPortal] = useState<NewsPortal | null>(null);

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

  useEffect(() => {
    let stopped = false;
    let portalCleanup: (() => void) | null = null;

    const mount = () => {
      if (stopped || portalCleanup) return;
      const prepared = prepareNewsPortal();
      if (!prepared) return;

      portalCleanup = prepared.cleanup;
      setNewsPortal(prepared.portal);
    };

    mount();
    const timers = [50, 150, 350, 700, 1200].map((delay) =>
      window.setTimeout(mount, delay)
    );

    return () => {
      stopped = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      portalCleanup?.();
      setNewsPortal(null);
    };
  }, [pathname]);

  return newsPortal
    ? createPortal(
        <CompanyNewsCarousel items={newsPortal.items} />,
        newsPortal.host
      )
    : null;
}
