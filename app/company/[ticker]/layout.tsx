import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";

type Props = {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp";

function yenOku(value: number | null | undefined) {
  if (!value) return "";
  return `${(value / 100000000).toFixed(1)}億円`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;

  const { data } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, risk_level, financials")
    .eq("ticker", ticker)
    .maybeSingle();

  if (!data) {
    return {
      title: `${ticker}の財務分析・決算評価 | 決算探偵`,
      description: `${ticker}の決算・財務指標・リスクシグナルを決算探偵で確認できます。`,
    };
  }

  const revenue = yenOku(data.financials?.revenue);
  const operatingIncome = yenOku(data.financials?.operatingIncome);
  const operatingCF = yenOku(data.financials?.operatingCF);

  const title = `${data.company_name}（${data.ticker}）の財務分析・決算評価 | 決算探偵`;

  const description = `${data.company_name}（${data.ticker}）の売上高${revenue ? ` ${revenue}` : ""}、営業利益${operatingIncome ? ` ${operatingIncome}` : ""}、営業CF${operatingCF ? ` ${operatingCF}` : ""}、総合スコア${data.score}、Danger Score${data.danger_score}を確認できます。`;

  const url = `${appUrl}/company/${data.ticker}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "決算探偵",
      type: "website",
      locale: "ja_JP",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function CompanyLayout({ children }: Props) {
  return children;
}