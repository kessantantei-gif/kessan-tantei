import type { Metadata } from "next";
import Link from "next/link";
import AllMarketCompanySearch from "@/components/all-market-company-search";
import MarketPortalCard from "@/components/market-portal-card";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";
import { marketList } from "@/lib/markets";
import { supabaseAdmin } from "@/lib/supabase";

type CompanyResult = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
};

const siteUrl = "https://kessan-tantei.jp";
const shareUrl = `${siteUrl}/markets`;
const shareImage = `${siteUrl}/markets/opengraph-image`;

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "市場を選ぶ | 決算探偵",
  description:
    "プライム・スタンダード・グロースの市場別に、決算ランキングと財務分析を確認できます。",
  alternates: { canonical: "/markets" },
  openGraph: {
    title: "決算探偵 | 日本株全市場の財務分析ランキング",
    description:
      "プライム・スタンダード・グロースの上場企業を、決算データから成長性・収益性・キャッシュ・財務リスクで比較できます。",
    url: shareUrl,
    siteName: "決算探偵",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: shareImage,
        width: 1200,
        height: 630,
        alt: "決算探偵 日本株全市場の財務分析",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "決算探偵 | 日本株全市場の財務分析ランキング",
    description:
      "プライム・スタンダード・グロースの上場企業を、決算データから比較・分析できます。",
    images: [shareImage],
  },
};

async function loadCompanies() {
  return loadAllSupabaseRows<CompanyResult>(
    "全市場検索会社取得失敗",
    (from, to) =>
      supabaseAdmin
        .from("all_market_companies")
        .select("ticker, company_name, market_segment")
        .eq("listing_status", "listed")
        .in("market_segment", ["prime", "standard", "growth"])
        .order("ticker", { ascending: true })
        .range(from, to)
  );
}

export default async function MarketsPage() {
  const companies = await loadCompanies();

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.14),transparent_30%),radial-gradient(circle_at_top_left,_rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.14),transparent_35%)]" />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-20">
        <div className="max-w-4xl">
          <p className="text-xs font-black tracking-[0.3em] text-cyan-300">MARKET SELECT</p>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-7xl">
            市場を選んで、
            <br />
            決算から企業を見抜く。
          </h1>
          <p className="mt-6 text-base leading-8 text-slate-300 sm:text-lg">
            会社を検索するか、プライム・スタンダード・グロースから市場を選択してください。
          </p>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <h2 className="text-2xl font-black">全市場から会社を検索</h2>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            会社名の一部、ひらがな・カタカナ、英字、証券コードで3市場を横断検索できます。
          </p>
          <AllMarketCompanySearch companies={companies} />
        </section>

        <section id="market-ranking" className="scroll-mt-24">
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {marketList.map((market) => (
              <MarketPortalCard key={market.slug} market={market} />
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.25em] text-green-300">
            COMPANY DIRECTORIES
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            市場別の全企業一覧
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">
            検索ボックスを使わず、分析済み企業を証券コード順に確認できます。各社の財務スコア、売上成長率、営業利益率、Danger Scoreへ直接移動できます。
          </p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {marketList.map((market) => (
              <Link
                key={`directory-${market.slug}`}
                href={`/companies/${market.slug}`}
                className="group rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:-translate-y-0.5 hover:border-green-300/35 hover:bg-white/10"
              >
                <p className="text-xs font-black tracking-[0.18em] text-slate-500">
                  {market.englishName.toUpperCase()} DIRECTORY
                </p>
                <h3 className="mt-2 text-xl font-black">{market.name}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  分析済み企業を100社ずつのHTML一覧で確認します。
                </p>
                <p className="mt-4 text-sm font-black text-green-300">
                  全企業一覧を見る →
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <h2 className="text-2xl font-black">共通アカウントで利用できます</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">
            ウォッチリスト、掲示板、Pro契約、アラート、管理画面は3市場で共通です。市場ごとに別サイトを運用せず、1つの決算探偵として管理します。
          </p>
        </section>
      </section>
    </main>
  );
}
