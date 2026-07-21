"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Spinner from "@/components/spinner";

function internalNavigationDestination(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }

  const target = event.target;
  if (!(target instanceof Element)) return null;

  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return null;
  }

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return null;

  const current = new URL(window.location.href);
  if (
    destination.pathname === current.pathname &&
    destination.search === current.search
  ) {
    return null;
  }

  return destination;
}

export default function NavigationFeedback() {
  const pathname = usePathname();
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);

  useEffect(() => {
    setPendingDestination(null);
  }, [pathname]);

  useEffect(() => {
    const finishNavigation = () => {
      setPendingDestination(null);
      window.dispatchEvent(new Event("navigation-settled"));
    };

    const handleClick = (event: MouseEvent) => {
      const destination = internalNavigationDestination(event);
      if (destination) setPendingDestination(destination.href);
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("pageshow", finishNavigation);
    window.addEventListener("popstate", finishNavigation);
    window.addEventListener("hashchange", finishNavigation);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("pageshow", finishNavigation);
      window.removeEventListener("popstate", finishNavigation);
      window.removeEventListener("hashchange", finishNavigation);
    };
  }, []);

  useEffect(() => {
    if (!pendingDestination) return;

    const destination = new URL(pendingDestination);
    let finished = false;
    let frameOne: number | null = null;
    let frameTwo: number | null = null;

    const finishNavigation = () => {
      if (finished) return;
      finished = true;
      setPendingDestination(null);
      window.dispatchEvent(new Event("navigation-settled"));
    };

    const currentUrlMatchesDestination = () =>
      window.location.pathname === destination.pathname &&
      window.location.search === destination.search;

    const checkForCompletedNavigation = () => {
      if (!currentUrlMatchesDestination()) return;

      frameOne = window.requestAnimationFrame(() => {
        frameTwo = window.requestAnimationFrame(finishNavigation);
      });
    };

    checkForCompletedNavigation();
    const urlCheckTimer = window.setInterval(checkForCompletedNavigation, 100);
    const safetyTimer = window.setTimeout(finishNavigation, 8000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForCompletedNavigation();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      finished = true;
      window.clearInterval(urlCheckTimer);
      window.clearTimeout(safetyTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (frameOne !== null) window.cancelAnimationFrame(frameOne);
      if (frameTwo !== null) window.cancelAnimationFrame(frameTwo);
    };
  }, [pendingDestination]);

  useEffect(() => {
    if (pendingDestination) {
      document.documentElement.dataset.navigationPending = "true";
    } else {
      delete document.documentElement.dataset.navigationPending;
    }

    return () => {
      delete document.documentElement.dataset.navigationPending;
    };
  }, [pendingDestination]);

  if (!pendingDestination) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="ページを読み込んでいます"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100]"
    >
      <div className="navigation-progress-bar h-1 bg-green-400 shadow-[0_0_14px_rgba(74,222,128,0.9)]" />
      <div className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-green-400/40 bg-[#050816]/95 px-4 py-2 text-sm font-bold text-green-200 shadow-2xl shadow-black/50 backdrop-blur">
        <Spinner />
        読み込み中...
      </div>
    </div>
  );
}
