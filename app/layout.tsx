import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
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

const SEARCH_CRAWLER_HEADER = "x-kessan-search-crawler";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://kessan-tantei.jp"),
  applicationName: "決算探偵",
  title: "日本株の決算分析・財務ランキング | 決算探偵",
  description:
    "決算探偵は、プライム・スタンダード・グロースの日本株を対象に、最新決算、売上・利益・キャッシュフロー、財務スコア、リスクシグナルを比較できる財務分析サイトです。",
  category: "finance",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: "GprsF0U3m9SZj2MJ5AUo9FK-Ame_DGhpPLv5LKiIyqA",
  },
  openGraph: {
    title: "日本株の決算分析・財務ランキング | 決算探偵",
    description:
      "最新決算と財務データから、プライム・スタンダード・グロースの上場企業を比較・分析できます。",
    url: "https://kessan-tantei.jp/",
    siteName: "決算探偵",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "https://kessan-tantei.jp/og-image-all-markets.png",
        width: 1200,
        height: 630,
        alt: "決算探偵 日本株の決算分析・財務ランキング",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "日本株の決算分析・財務ランキング | 決算探偵",
    description:
      "最新決算と財務データから、日本株の成長性・収益性・キャッシュ・財務リスクを比較できます。",
    images: ["https://kessan-tantei.jp/og-image-all-markets.png"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const isSearchCrawler =
    requestHeaders.get(SEARCH_CRAWLER_HEADER) === "1";

  const document = (
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
        {!isSearchCrawler ? <AuthButton /> : null}
        <Toaster richColors position="top-right" />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );

  // Search crawlers bypass clerkMiddleware in proxy.ts so they never enter the
  // development-instance handshake. Keep ClerkProvider mounted so nested public
  // UI components such as SignInButton can render safely during SSR. Server-side
  // auth/currentUser calls remain signed-out for crawlers via lib/clerk-server.ts,
  // so crawler requests cannot unlock authenticated or Pro-only content.
  return <ClerkProvider>{document}</ClerkProvider>;
}
