import Link from "next/link";
import type { MarketSlug } from "@/lib/markets";
import { marketDefinitions } from "@/lib/markets";

const toneClasses = {
  standard: {
    eyebrow: "text-cyan-300",
    panel: "border-cyan-400/20 bg-cyan-500/10",
    button: "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
  },
  prime: {
    eyebrow: "text-violet-300",
    panel: "border-violet-400/20 bg-violet-500/10",
    button: "bg-violet-300 text-slate-950 hover:bg-violet-200",
  },
} as const;

export default function MarketBuildingPage({ marketSlug }: { marketSlug: Exclude<MarketSlug, "growth"> }) {
  const market = marketDefinitions[marketSlug];
  const tone = toneClasses[marketSlug];

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(139,92,246,0.14),transparent_35%)]" />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-20">
        <p className={`text-xs font-black tracking-[0.3em] ${tone.eyebrow}`}>
          {market.englishName.toUpperCase()}
        </p>
        <h1 className="mt-4 text-4xl font-black sm:text-6xl">{market.name}の決算探偵</h1>
        <p className="mt-6 max-w-4xl text-base leading-8 text-slate-300 sm:text-lg">
          {market.description}
        </p>

        <section className={`mt-10 rounded-3xl border p-6 sm:p-8 ${tone.panel}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.25em] text-slate-400">BUILD STATUS</p>
              <h2 className="mt-2 text-2xl font-black">市場別分析基盤を構築中</h2>
            </div>
            <span className="w-fit rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-black">
              PHASE 1
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              ["対象銘柄マスタ", "市場区分・業種・上場状態を管理する共通マスタを整備"],
              ["EDINET自動取得", "対象企業の有価証券報告書を取得して履歴データを蓄積"],
              ["市場別スコア", "市場特性に合わせて成長・収益・安全性・資本効率を評価"],
              ["全数監査", "単位差・欠損・期間重複・財務整合性を公開前に検査"],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <h3 className="font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/markets" className={`rounded-2xl px-5 py-3 font-black transition ${tone.button}`}>
            市場選択へ戻る
          </Link>
          <Link
            href="/"
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            グロース市場を見る
          </Link>
        </div>
      </section>
    </main>
  );
}
