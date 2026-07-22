"use client";

import {
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import styles from "./company-news-carousel.module.css";

export type CompanyNewsRecord = {
  url: string;
  published_at: string | null;
  title: string;
  summary: string | null;
  source: string | null;
};

type DisplayNewsItem = {
  href: string;
  date: string;
  title: string;
  summary: string;
  category: string;
  source: string;
};

type Props = {
  items: CompanyNewsRecord[];
};

type TouchStart = {
  x: number;
  y: number;
};

const SOURCE_SUFFIX =
  /\s*(?:[-–—|｜:：]\s*)?(?:ログミー\s*Finance|日経会社情報\s*DIGITAL|日本経済新聞|PR TIMES|株探|Yahoo!ファイナンス|みんかぶ)\s*$/i;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function compactLength(value: string) {
  return value.replace(/[\s、。・,:：()（）\[\]【】\-–—|｜]/g, "").length;
}

function stripSourceSuffix(value: string) {
  return value.replace(SOURCE_SUFFIX, "").trim();
}

function formatNewsDate(value: string | null) {
  if (!value) return "日付不明";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日付不明";

  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cleanNewsTitle(rawTitle: string) {
  const original = normalizeText(rawTitle);
  const safeOriginal = stripSourceSuffix(original) || original;

  const candidate = safeOriginal
    .replace(/^[（(]\d{4}[A-Z]?[）)]\s*[、,:：\-–—]\s*/, "")
    .replace(/^\[\d{4}[A-Z]?]\s*[、,:：\-–—]\s*/, "")
    .replace(
      /^[^「『【]{1,48}[（(]\d{4}[A-Z]?[）)]\s*[、,:：\-–—]\s*/,
      ""
    )
    .replace(
      /^[^「『【]{1,48}\[\d{4}[A-Z]?]\s*[、,:：\-–—]\s*/,
      ""
    )
    .trim();

  const candidateLength = compactLength(candidate);
  const originalLength = compactLength(safeOriginal);
  const wasOverTrimmed =
    candidateLength < 8 ||
    (originalLength >= 24 && candidateLength < originalLength * 0.3);

  return wasOverTrimmed ? safeOriginal : candidate;
}

function fallbackTitleFromSummary(summary: string) {
  const firstSentence = summary
    .split(/[。！？!?]/)[0]
    ?.replace(/^[\s\-–—:：・|｜]+/, "")
    .trim();

  if (!firstSentence || compactLength(firstSentence) < 8) return "";
  return firstSentence.length > 54
    ? `${firstSentence.slice(0, 54).trim()}…`
    : firstSentence;
}

function cleanNewsSummary(
  rawSummary: string | null,
  rawTitle: string,
  displayTitle: string
) {
  const original = normalizeText(rawSummary);
  if (!original) return "";

  let summary = stripSourceSuffix(original);
  const titleCandidates = [normalizeText(rawTitle), displayTitle]
    .map(stripSourceSuffix)
    .filter((value, index, values) => value && values.indexOf(value) === index);

  for (const title of titleCandidates) {
    if (!summary.startsWith(title)) continue;

    const remainder = summary
      .slice(title.length)
      .replace(/^[\s\-–—:：・|｜]+/, "")
      .trim();

    if (compactLength(remainder) >= 12) {
      summary = remainder;
      break;
    }
  }

  summary = summary.replace(/^[\s\-–—:：・|｜]+/, "").trim();

  const normalizedSummary = summary.replace(/\s+/g, "");
  const normalizedTitle = displayTitle.replace(/\s+/g, "");
  if (!normalizedSummary || normalizedSummary === normalizedTitle) return "";

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

function getSourceLabel(item: CompanyNewsRecord) {
  const supplied = normalizeText(item.source);
  if (supplied) return supplied;

  if (/ログミー\s*Finance/i.test(item.title)) return "ログミーFinance";
  if (/日本経済新聞|日経会社情報/.test(item.title)) return "日本経済新聞";
  if (/PR TIMES/i.test(item.title)) return "PR TIMES";
  if (/Yahoo!ファイナンス/i.test(item.title)) return "Yahoo!ファイナンス";
  if (/株探/.test(item.title)) return "株探";
  if (/みんかぶ/.test(item.title)) return "みんかぶ";

  try {
    const hostname = new URL(item.url).hostname.replace(/^www\./, "");
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

function toDisplayItem(item: CompanyNewsRecord): DisplayNewsItem | null {
  const rawSummary = normalizeText(item.summary);
  const cleanedTitle = cleanNewsTitle(item.title);
  const title =
    compactLength(cleanedTitle) >= 8
      ? cleanedTitle
      : fallbackTitleFromSummary(rawSummary) || normalizeText(item.title);
  const summary = cleanNewsSummary(item.summary, item.title, title);

  if (!/^https?:\/\//i.test(item.url)) return null;
  if (compactLength(title) < 8 && compactLength(summary) < 12) return null;

  return {
    href: item.url,
    date: formatNewsDate(item.published_at),
    title,
    summary,
    category: getNewsCategory(title, summary),
    source: getSourceLabel(item),
  };
}

export default function CompanyNewsCarousel({ items }: Props) {
  const displayItems = useMemo(
    () => items.map(toDisplayItem).filter((item): item is DisplayNewsItem => item !== null),
    [items]
  );
  const touchStartRef = useRef<TouchStart | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  function goTo(requestedIndex: number) {
    setActiveIndex(clamp(requestedIndex, 0, displayItems.length - 1));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches.item(0);
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    const touch = event.changedTouches.item(0);
    touchStartRef.current = null;
    if (!start || !touch) return;

    const deltaX = start.x - touch.clientX;
    const deltaY = start.y - touch.clientY;
    const isHorizontalSwipe =
      Math.abs(deltaX) >= 24 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1;

    if (!isHorizontalSwipe) return;

    suppressClickUntilRef.current = Date.now() + 500;
    goTo(activeIndex + (deltaX > 0 ? 1 : -1));
  }

  if (displayItems.length === 0) {
    return <p className={styles.empty}>表示できる関連ニュースはまだありません。</p>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.count}>最新{displayItems.length}件</span>
        <span className={styles.position} aria-live="polite">
          {activeIndex + 1} / {displayItems.length}
        </span>
      </div>

      <div
        className={styles.viewport}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={styles.track}
          role="list"
          aria-label="会社ニュース一覧"
          style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
        >
          {displayItems.map((item, index) => (
            <a
              key={`${item.href}-${index}`}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              role="listitem"
              className={`${styles.card} ${index === 0 ? styles.latestCard : ""}`}
              aria-label={`${item.title}を外部サイトで開く`}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onClick={(event) => {
                if (Date.now() < suppressClickUntilRef.current) {
                  event.preventDefault();
                }
              }}
            >
              <div className={styles.meta}>
                <div className={styles.badges}>
                  {index === 0 ? <span className={styles.latestBadge}>最新</span> : null}
                  <span className={styles.categoryBadge}>{item.category}</span>
                </div>
                <time className={styles.date}>{item.date}</time>
              </div>

              <h3 className={styles.title}>{item.title}</h3>
              {item.summary ? (
                <p className={styles.summary}>{item.summary}</p>
              ) : (
                <p className={styles.summaryUnavailable}>
                  要約を取得できなかったため、見出しのみ表示しています。
                </p>
              )}

              <div className={styles.footer}>
                <span className={styles.source}>{item.source}</span>
                <span className={styles.open}>記事を読む ↗</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => goTo(activeIndex - 1)}
          disabled={activeIndex === 0}
          aria-label="前のニュース"
        >
          ←
        </button>

        <div className={styles.dots} aria-label="ニュース位置">
          {displayItems.map((item, index) => (
            <button
              key={`${item.href}-dot-${index}`}
              type="button"
              className={`${styles.dot} ${activeIndex === index ? styles.activeDot : ""}`}
              onClick={() => goTo(index)}
              aria-label={`${index + 1}件目のニュースを表示`}
              aria-current={activeIndex === index ? "true" : undefined}
            />
          ))}
        </div>

        <button
          type="button"
          className={styles.arrow}
          onClick={() => goTo(activeIndex + 1)}
          disabled={activeIndex === displayItems.length - 1}
          aria-label="次のニュース"
        >
          →
        </button>
      </div>

      <p className={styles.hint}>左右に1回スワイプすると、次の1件へ移動します</p>
    </div>
  );
}
