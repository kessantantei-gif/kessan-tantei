import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import AuthButton from "@/components/auth-button";
import FeedbackButton from "@/components/feedback-button";

export const metadata: Metadata = {
  title: "決算探偵 | グロース市場特化の財務分析ランキング",
  description:
    "決算探偵は、グロース市場に特化した財務分析ランキングです。EDINET決算データを自動解析し、成長性・収益品質・安全性・リスクシグナルから企業の特徴を可視化します。",
  verification: {
    google: "GprsF0U3m9SZj2MJ5AUo9FK-Ame_DGhpPLv5LKiIyqA",
  },

  openGraph: {
    title: "決算探偵 | グロース市場特化の財務分析ランキング",
    description:
      "そのグロース株、本当に買って大丈夫ですか？会計士視点で財務リスクと成長性を可視化。",
    url: "https://kessan-tantei.jp",
    siteName: "決算探偵",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "https://kessan-tantei.jp/og-image.png",
        width: 1200,
        height: 630,
        alt: "決算探偵 OGP",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "決算探偵 | グロース市場特化の財務分析ランキング",
    description:
      "そのグロース株、本当に買って大丈夫ですか？グロース市場特化の財務分析ランキング。",
    images: ["https://kessan-tantei.jp/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="ja">
        <body>
          <nav
            aria-label="グローバルナビゲーション"
            className="relative z-40 border-b border-white/10 bg-[#050816] text-white"
          >
            <div className="mx-auto flex max-w-7xl flex-nowrap items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-8 sm:py-3">
              <Link
                href="/"
                className="shrink-0 whitespace-nowrap text-sm font-black tracking-tight hover:text-green-300 sm:text-base"
              >
                決算探偵
              </Link>
              <div className="flex min-w-0 flex-nowrap items-center gap-0.5 text-xs font-bold sm:gap-2 sm:text-sm">
                <Link
                  href="/ranking"
                  className="shrink-0 whitespace-nowrap rounded-full border border-green-400/30 bg-green-500/10 px-2 py-2 text-green-300 transition hover:bg-green-500/20 hover:text-green-200 sm:px-4"
                >
                  ランキング
                </Link>
                <Link
                  href="/news"
                  className="shrink-0 whitespace-nowrap rounded-full px-2 py-2 text-slate-300 transition hover:bg-white/5 hover:text-white sm:px-3"
                >
                  ニュース
                </Link>
                <Link
                  href="/pricing"
                  className="shrink-0 whitespace-nowrap rounded-full bg-yellow-400 px-2 py-2 font-black text-slate-950 transition hover:bg-yellow-300 sm:px-4"
                >
                  <span className="sm:hidden">Pro</span>
                  <span className="hidden sm:inline">初月100円Pro</span>
                </Link>
              </div>
            </div>
          </nav>
          {children}
          <FeedbackButton />
          <AuthButton />
          <Toaster richColors position="top-right" />
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
