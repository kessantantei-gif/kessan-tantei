import type { Metadata } from "next";
import AlertsPageClient from "@/components/alerts-page-client";

export const metadata: Metadata = {
  title: "アラート | 決算探偵",
  description: "決算探偵のアラート設定ページです。ウォッチ銘柄の決算更新やスコア変化の通知条件を管理できます。",
};

export default function AlertsPage() {
  return <AlertsPageClient />;
}
