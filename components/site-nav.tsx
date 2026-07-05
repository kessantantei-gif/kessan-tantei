"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/ranking", label: "ランキング", shortLabel: "ランキング" },
  { href: "/news", label: "ニュース", shortLabel: "ニュース" },
  { href: "/pricing", label: "初月100円Pro", shortLabel: "Pro", accent: true },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="グローバルナビゲーション"
      className="relative z-50 isolate border-b border-white/10 bg-[#050816]/95 text-white shadow-lg shadow-black/20 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-8 sm:py-3">
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-1 text-xl font-black tracking-tight text-white transition hover:text-green-300 active:scale-95 sm:px-0 sm:text-2xl"
          aria-label="決算探偵トップへ"
        >
          決算探偵
        </Link>

        <div className="flex min-w-0 shrink-0 items-center gap-1 text-xs font-bold sm:gap-2 sm:text-sm">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            const baseClass =
              "flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-2 transition duration-150 ease-out active:scale-95 sm:px-4";
            const normalClass = item.accent
              ? "border-yellow-300/70 bg-yellow-400 text-slate-950 shadow-sm shadow-yellow-400/20 hover:bg-yellow-300 active:bg-yellow-500"
              : "border-white/10 bg-white/5 text-slate-300 hover:border-green-400/40 hover:bg-white/10 hover:text-white active:bg-white/15";
            const activeClass = item.accent
              ? "border-yellow-200 bg-yellow-300 text-slate-950 ring-2 ring-yellow-200/30"
              : "border-green-400/60 bg-green-500/15 text-green-200 ring-2 ring-green-400/20";

            return (
              <Link
                key={item.href}
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
