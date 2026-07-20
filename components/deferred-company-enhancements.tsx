"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const CompanyTrendChartEnhancer = lazy(
  () => import("@/components/company-trend-chart-enhancer")
);
const ScoreExplanationInjector = lazy(
  () => import("@/components/score-explanation-injector")
);
const CompanyAiSummaryInjector = lazy(
  () => import("@/components/company-ai-summary-injector")
);
const CompanyFinancialSignalsInjector = lazy(
  () => import("@/components/company-financial-signals-injector")
);
const CompanyPeerComparisonInjector = lazy(
  () => import("@/components/company-peer-comparison-injector")
);
const CompanyEarningsFlashInjector = lazy(
  () => import("@/components/company-earnings-flash-injector")
);
const CompanyProAnalysisInjector = lazy(
  () => import("@/components/company-pro-analysis-injector")
);
const CompanyWatchlistInjector = lazy(
  () => import("@/components/company-watchlist-injector")
);
const CompanyCompareFloatingButton = lazy(
  () => import("@/components/company-compare-floating-button")
);
const CompanyPageOrderController = lazy(
  () => import("@/components/company-page-order-controller")
);
const CompanyProBoundaryController = lazy(
  () => import("@/components/company-pro-boundary-controller")
);
const CompanyDataQualityWarning = lazy(
  () => import("@/components/company-data-quality-warning")
);

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number }
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export default function DeferredCompanyEnhancements() {
  const pathname = usePathname();
  const isCompanyPage = /^\/company\/[^/]+\/?$/.test(pathname ?? "");
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isCompanyPage) {
      setStage(0);
      return;
    }

    const idleWindow = window as IdleWindow;
    let idleHandle: number | null = null;

    const firstStage = () => setStage((current) => Math.max(current, 1));
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(firstStage, { timeout: 1200 });
    } else {
      idleHandle = window.setTimeout(firstStage, 800);
    }

    const secondStage = window.setTimeout(
      () => setStage((current) => Math.max(current, 2)),
      2800
    );

    return () => {
      if (idleHandle !== null) {
        if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      window.clearTimeout(secondStage);
    };
  }, [isCompanyPage, pathname]);

  if (!isCompanyPage || stage === 0) return null;

  return (
    <Suspense fallback={null}>
      <CompanyPageOrderController />
      <CompanyProBoundaryController />
      <CompanyDataQualityWarning />
      <CompanyWatchlistInjector />
      <CompanyCompareFloatingButton />
      {stage >= 2 ? (
        <>
          <CompanyTrendChartEnhancer />
          <ScoreExplanationInjector />
          <CompanyAiSummaryInjector />
          <CompanyFinancialSignalsInjector />
          <CompanyPeerComparisonInjector />
          <CompanyEarningsFlashInjector />
          <CompanyProAnalysisInjector />
        </>
      ) : null}
    </Suspense>
  );
}
