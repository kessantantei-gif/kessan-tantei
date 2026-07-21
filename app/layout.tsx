import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./mobile-interactions.css";
import AuthButton from "@/components/auth-button";
import FeedbackButton from "@/components/feedback-button";
import SiteNav from "@/components/site-nav";
import NavigationFeedback from "@/components/navigation-feedback";
import CompanyPageOrderController from "@/components/company-page-order-controller";
import CompanyStockChart from "@/components/company-stock-chart";
import CompareTray from "@/components/compare-tray";
import AcquisitionTracker from "@/components/acquisition-tracker";
import RecentCompanyTracker from "@/components/recent-company-tracker";
import SeoJsonLd, {
  organizationJsonLd,
  websiteJsonLd,
} from "@/components/seo-json-ld";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://kessan-tantei.jp"),
  title: "決算探偵 | 日本株全市場の財務分析ランキング",
  description:
    "決算探偵は、プライム・スタンダード・グロースの日本株を対象にした財務分析ランキングです。EDINET決算データを自動解析し、成長性・収益性・キャッシュ・安全性・リスクシグナルから企業の特徴を可視化します。",
  alternates: {
    canonical: "/",
  },
  verification: {
    google: "GprsF0U3m9SZj2MJ5AUo9FK-Ame_DGhpPLv5LKiIyqA",
  },
  openGraph: {
    title: "決算探偵 | 日本株全市場の財務分析ランキング",
    description:
      "プライム・スタンダード・グロースの上場企業を、決算データから成長性・収益性・キャッシュ・財務リスクで比較できます。",
    url: "https://kessan-tantei.jp/",
    siteName: "決算探偵",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "https://kessan-tantei.jp/og-image-all-markets.png",
        width: 1200,
        height: 630,
        alt: "決算探偵 OGP",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "決算探偵 | 日本株全市場の財務分析ランキング",
    description:
      "プライム・スタンダード・グロースの上場企業を、決算データから比較・分析できます。",
    images: ["https://kessan-tantei.jp/og-image-all-markets.png"],
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
          <Suspense fallback={null}>
            <AcquisitionTracker />
          </Suspense>
          <RecentCompanyTracker />
          <SiteNav />
          <NavigationFeedback />
          {children}
          <CompanyPageOrderController />
          <CompanyStockChart />
          <CompareTray />
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
