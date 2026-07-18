"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  accent?: boolean;
};

function marketBase(pathname: string) {
  if (pathname === "/standard" || pathname.startsWith("/standard/")) return "/standard";
  if (pathname === "/prime" || pathname.startsWith("/prime/")) return "/prime";
  return "";
}

function navItems(pathname: string): NavItem[] {
  const base = marketBase(pathname);
  const rankingHref = base ? `${base}/ranking` : "/ranking";
  const homeHref = base || "/";

  return [
    { href: "/markets", label: "市場を選ぶ", shortLabel: "市場" },
    { href: homeHref, label: "市場トップ", shortLabel: "トップ" },
    { href: rankingHref, label: "ランキング", shortLabel: "順位" },
    { href: "/updates", label: "今日の更新", shortLabel: "更新" },
    { href: "/watchlist", label: "ウォッチ", shortLabel: "保存" },
    { href: "/alerts", label: "アラート", shortLabel: "通知" },
    { href: "/news", label: "ニュース", shortLabel: "ニュース" },
    { href: "/data-quality", label: "データ品質", shortLabel: "品質" },
    { href: "/pricing", label: "初月100円Pro", shortLabel: "Pro", accent: true },
  ];
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/growth";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname();
  const items = navItems(pathname);

  return (
    <nav
      aria-label="グローバルナビゲーション"
      className="sticky top-0 z-50 isolate border-b border-white/10 bg-[#050816]/95 text-white shadow-lg shadow-black/20 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-8 sm:py-3">
        <Link
          href="/markets"
          className="flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-1 text-lg font-black tracking-tight text-white transition hover:text-green-300 active:scale-95 sm:min-h-11 sm:px-0 sm:text-2xl"
          aria-label="決算探偵の市場選択へ"
        >
          決算探偵
        </Link>

        <div className="no-scrollbar -mr-3 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pr-3 text-[11px] font-bold sm:mr-0 sm:gap-2 sm:pr-0 sm:text-sm">
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const baseClass =
              "flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2 py-2 transition duration-150 ease-out active:scale-95 sm:min-h-11 sm:px-4";
            const normalClass = item.accent
              ? "border-yellow-300/70 bg-yellow-400 text-slate-950 shadow-sm shadow-yellow-400/20 hover:bg-yellow-300 active:bg-yellow-500"
              : "border-white/10 bg-white/5 text-slate-300 hover:border-green-400/40 hover:bg-white/10 hover:text-white active:bg-white/15";
            const activeClass = item.accent
              ? "border-yellow-200 bg-yellow-300 text-slate-950 ring-2 ring-yellow-200/30"
              : "border-green-400/60 bg-green-500/15 text-green-200 ring-2 ring-green-400/20";

            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${baseClass} ${active ? activeClass : normalClass}`}
              >
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
