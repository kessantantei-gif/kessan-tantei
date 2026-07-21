"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Spinner from "@/components/spinner";

function isInternalNavigation(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return false;
  }

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return false;
  if (
    destination.pathname === window.location.pathname &&
    destination.search === window.location.search
  ) {
    return false;
  }

  return true;
}

export default function NavigationFeedback() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) setPending(true);
    };

    const handlePageShow = () => setPending(false);

    document.addEventListener("click", handleClick, true);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (pending) {
      document.documentElement.dataset.navigationPending = "true";
    } else {
      delete document.documentElement.dataset.navigationPending;
    }

    return () => {
      delete document.documentElement.dataset.navigationPending;
    };
  }, [pending]);

  if (!pending) return null;

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
