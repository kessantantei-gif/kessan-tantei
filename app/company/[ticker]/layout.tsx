import type { Metadata } from "next";
import Link from "next/link";
import CompanyPageScrollReset from "@/components/company-page-scroll-reset";
import { loadRuntimeCompanyMasterMap } from "@/lib/company-master-runtime";
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
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "決算探偵",
      type: "website",
      locale: "ja_JP",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CompanyLayout({ children, params }: Props) {
  const { ticker } = await params;
  const masterMap = await loadRuntimeCompanyMasterMap();
  const master = masterMap.get(ticker);

  return (
    <>
      <CompanyPageScrollReset ticker={ticker} />
      {children}
      <section className="bg-[#050816] px-4 pb-12 text-white sm:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.25em] text-cyan-300">RELATED ANALYSIS</p>
          <h2 className="mt-2 text-2xl font-black">関連する企業・ランキングを確認</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            同じ事業テーマの企業や、成長性・収益性・営業CF・リスクのランキングとあわせて確認できます。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {master && master.themeId !== "other" ? (
              <Link
                href={`/themes/${master.themeId}`}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200 hover:bg-cyan-400/20"
              >
                {master.theme}の企業一覧
              </Link>
            ) : (
              <Link
                href="/themes"
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200 hover:bg-cyan-400/20"
              >
                テーマ別企業一覧
              </Link>
            )}
            <Link href="/ranking/revenue-growth" className="rounded-full border border-green-300/20 bg-green-400/10 px-4 py-2 text-sm font-black text-green-200">売上成長率</Link>
            <Link href="/ranking/operating-margin" className="rounded-full border border-yellow-300/20 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-200">営業利益率</Link>
            <Link href="/ranking/operating-cash-flow" className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200">営業CF</Link>
            <Link href="/ranking/risk-signal" className="rounded-full border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-black text-red-200">リスクシグナル</Link>
            <Link href="/features" className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-black text-slate-200">財務特徴から探す</Link>
          </div>
        </div>
      </section>
    </>
  );
}
