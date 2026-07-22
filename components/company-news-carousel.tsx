"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import styles from "./company-news-carousel.module.css";

export type CompanyNewsItem = {
  href: string;
  date: string;
  title: string;
  summary: string;
  category: string;
  source: string;
};

type Props = {
  items: CompanyNewsItem[];
};

type TouchStart = {
  x: number;
  y: number;
  index: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function CompanyNewsCarousel({ items }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<TouchStart | null>(null);
  const suppressClickUntilRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const goTo = useCallback(
    (requestedIndex: number, behavior: ScrollBehavior = "smooth") => {
      const track = trackRef.current;
      if (!track || items.length === 0) return;

      const index = clamp(requestedIndex, 0, items.length - 1);
      const card = track.children.item(index);
      if (!(card instanceof HTMLElement)) return;

      track.scrollTo({ left: card.offsetLeft, behavior });
      setActiveIndex(index);
    },
    [items.length]
  );

  const updateActiveFromScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const cards = Array.from(track.children).filter(
      (card): card is HTMLElement => card instanceof HTMLElement
    );
    if (cards.length === 0) return;

    const target = track.scrollLeft;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const distance = Math.abs(card.offsetLeft - target);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveIndex(closestIndex);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  function handleScroll() {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateActiveFromScroll();
    });
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches.item(0);
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      index: activeIndex,
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
      Math.abs(deltaX) >= 28 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15;

    if (isHorizontalSwipe) {
      suppressClickUntilRef.current = Date.now() + 450;
      goTo(start.index + (deltaX > 0 ? 1 : -1));
      return;
    }

    window.setTimeout(updateActiveFromScroll, 80);
  }

  if (items.length === 0) {
    return (
      <p className={styles.empty}>関連ニュースはまだ取得されていません。</p>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.count}>最新{items.length}件</span>
        <span className={styles.position} aria-live="polite">
          {activeIndex + 1} / {items.length}
        </span>
      </div>

      <div
        ref={trackRef}
        className={styles.track}
        role="list"
        aria-label="会社ニュース一覧"
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {items.map((item, index) => (
          <a
            key={`${item.href}-${index}`}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            role="listitem"
            className={`${styles.card} ${
              index === 0 ? styles.latestCard : ""
            }`}
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
                {index === 0 ? (
                  <span className={styles.latestBadge}>最新</span>
                ) : null}
                <span className={styles.categoryBadge}>{item.category}</span>
              </div>
              <time className={styles.date}>{item.date}</time>
            </div>

            <h3 className={styles.title}>{item.title}</h3>
            {item.summary ? (
              <p className={styles.summary}>{item.summary}</p>
            ) : null}

            <div className={styles.footer}>
              <span className={styles.source}>{item.source}</span>
              <span className={styles.open}>記事を読む ↗</span>
            </div>
          </a>
        ))}
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
          {items.map((item, index) => (
            <button
              key={`${item.href}-dot-${index}`}
              type="button"
              className={`${styles.dot} ${
                activeIndex === index ? styles.activeDot : ""
              }`}
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
          disabled={activeIndex === items.length - 1}
          aria-label="次のニュース"
        >
          →
        </button>
      </div>

      <p className={styles.hint}>左右に1回スワイプすると、次の1件へ移動します</p>
    </div>
  );
}
