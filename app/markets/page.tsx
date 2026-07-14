import type { Metadata } from "next";
import MarketPortalCard from "@/components/market-portal-card";
import { marketList } from "@/lib/markets";

export const metadata: Metadata = {
  title: "市場を選ぶ | 決算探偵",
  description:
    "グロース・スタンダード・プライムの市場別に、決算ランキングと財務分析を確認できます。",
  alternates: { canonical: "/markets" },
};

export default function MarketsPage() {
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
            決算探偵は、上場市場ごとに異なる企業特性を踏まえて、財務・成長・キャッシュ・リスクを分析します。
            同じ画面構成で比較しながら、市場ごとに最適化した評価基準を使用します。
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {marketList.map((market) => (
            <MarketPortalCard key={market.slug} market={market} />
          ))}
        </div>

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
