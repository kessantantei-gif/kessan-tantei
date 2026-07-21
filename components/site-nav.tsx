"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import GlobalCompanySearch from "@/components/global-company-search";
import Spinner from "@/components/spinner";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  accent?: boolean;
};

function navItems(): NavItem[] {
  return [
    { href: "/markets", label: "市場を選ぶ", shortLabel: "市場" },
    { href: "/updates", label: "今日の更新", shortLabel: "更新" },
    { href: "/watchlist", label: "ウォッチ", shortLabel: "保存" },
    { href: "/alerts", label: "アラート", shortLabel: "通知" },
    { href: "/news", label: "ニュース", shortLabel: "ニュース" },
    { href: "/data-quality", label: "データ品質", shortLabel: "品質" },
    { href: "/pricing", label: "初月100円Pro", shortLabel: "Pro", accent: true },
  ];
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname();
  const items = navItems();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;

    const clearPending = () => setPendingHref(null);
    const safetyTimer = window.setTimeout(clearPending, 8000);

    window.addEventListener("navigation-settled", clearPending);
    window.addEventListener("pageshow", clearPending);
    window.addEventListener("popstate", clearPending);

    return () => {
      window.clearTimeout(safetyTimer);
      window.removeEventListener("navigation-settled", clearPending);
      window.removeEventListener("pageshow", clearPending);
      window.removeEventListener("popstate", clearPending);
    };
  }, [pendingHref]);

  return (
    <nav
      aria-label="グローバルナビゲーション"
      className="sticky top-0 z-50 isolate border-b border-white/10 bg-[#050816]/95 text-white shadow-lg shadow-black/20 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-8 sm:py-3">
        <Link
          href="/markets"
          data-pressable="true"
          onClick={() => {
            if (pathname !== "/markets") setPendingHref("/markets");
          }}
          aria-busy={pendingHref === "/markets"}
          className={`flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-1 text-lg font-black tracking-tight text-white transition hover:text-green-300 sm:min-h-11 sm:px-0 sm:text-2xl ${
            pendingHref === "/markets"
              ? "translate-y-0.5 scale-95 opacity-75"
              : "active:translate-y-0.5 active:scale-95 active:opacity-75"
          }`}
          aria-label="決算探偵の市場選択へ"
        >
          {pendingHref === "/markets" ? <Spinner /> : null}
          <span>{pendingHref === "/markets" ? "移動中" : "決算探偵"}</span>
        </Link>

        <GlobalCompanySearch />

        <div className="no-scrollbar -mr-3 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pr-3 text-[11px] font-bold sm:mr-0 sm:gap-2 sm:pr-0 sm:text-sm">
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const pending = pendingHref === item.href;
            const baseClass =
              "flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-2 transition duration-150 ease-out sm:min-h-11 sm:px-4";
            const normalClass = item.accent
              ? "border-yellow-300/70 bg-yellow-400 text-slate-950 shadow-sm shadow-yellow-400/20 hover:bg-yellow-300 active:bg-yellow-500"
              : "border-white/10 bg-white/5 text-slate-300 hover:border-green-400/40 hover:bg-white/10 hover:text-white active:bg-white/15";
            const activeClass = item.accent
              ? "border-yellow-200 bg-yellow-300 text-slate-950 ring-2 ring-yellow-200/30"
              : "border-green-400/60 bg-green-500/15 text-green-200 ring-2 ring-green-400/20";
            const pendingClass =
              "translate-y-0.5 scale-95 border-green-300/70 bg-green-400/20 text-green-100 opacity-80 shadow-inner shadow-black/50";

            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                data-pressable="true"
                aria-current={active ? "page" : undefined}
                aria-busy={pending}
                onClick={() => {
                  if (!active) setPendingHref(item.href);
                }}
                className={`${baseClass} ${
                  pending ? pendingClass : active ? activeClass : normalClass
                }`}
              >
                {pending ? <Spinner /> : null}
                {pending ? (
                  <span>移動中</span>
                ) : (
                  <>
                    <span className="sm:hidden">{item.shortLabel}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
