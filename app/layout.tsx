import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import AuthButton from "@/components/auth-button";
import FeedbackButton from "@/components/feedback-button";
import SiteNav from "@/components/site-nav";
import CompanyTrendChartEnhancer from "@/components/company-trend-chart-enhancer";
import ScoreExplanationInjector from "@/components/score-explanation-injector";
import CompanyAiSummaryInjector from "@/components/company-ai-summary-injector";
import CompanyFinancialSignalsInjector from "@/components/company-financial-signals-injector";
import CompanyPeerComparisonInjector from "@/components/company-peer-comparison-injector";
import CompanyEarningsFlashInjector from "@/components/company-earnings-flash-injector";
import CompanyProAnalysisInjector from "@/components/company-pro-analysis-injector";
import CompanyWatchlistInjector from "@/components/company-watchlist-injector";
import SeoJsonLd, { organizationJsonLd, websiteJsonLd } from "@/components/seo-json-ld";

export const metadata: Metadata = {
  metadataBase: new URL("https://kessan-tantei.jp"),
  title: "決算探偵 | グロース市場特化の財務分析ランキング",
  description:
    "決算探偵は、グロース市場に特化した財務分析ランキングです。EDINET決算データを自動解析し、成長性・収益品質・安全性・リスクシグナルから企業の特徴を可視化します。",
  alternates: {
    canonical: "/",
  },
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
          <SeoJsonLd data={[websiteJsonLd(), organizationJsonLd()]} />
          <SiteNav />
          {children}
          <CompanyTrendChartEnhancer />
          <ScoreExplanationInjector />
          <CompanyAiSummaryInjector />
          <CompanyFinancialSignalsInjector />
          <CompanyPeerComparisonInjector />
          <CompanyEarningsFlashInjector />
          <CompanyProAnalysisInjector />
          <CompanyWatchlistInjector />
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
