import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "決算ランキング一覧｜グロース企業の財務スコア・成長率・営業CFランキング",
  description:
    "決算探偵のランキング一覧ページです。グロース企業を財務スコア、売上成長率、営業利益率、営業CF、自己資本比率、リスクシグナルで比較できます。",
};

const rankings = [
  {
    icon: "📊",
    title: "財務スコアランキング",
    description: "成長性・収益性・安全性などをまとめた総合スコアで比較します。",
    href: "/ranking/score",
    tone: "from-green-500/20 to-emerald-500/5",
  },
  {
    icon: "📈",
    title: "売上成長率ランキング",
    description: "前期から売上高がどれだけ伸びたかを比率で比較します。",
    href: "/ranking/revenue-growth",
    tone: "from-blue-500/20 to-cyan-500/5",
  },
  {
    icon: "💹",
    title: "営業利益率ランキング",
    description: "売上高に対して、本業でどれだけ利益を残せたかを比較します。",
    href: "/ranking/operating-margin",
    tone: "from-yellow-500/20 to-amber-500/5",
  },
  {
    icon: "💵",
    title: "営業CFランキング",
    description: "本業の活動から生み出した現金の大きさを比較します。",
    href: "/ranking/operating-cash-flow",
    tone: "from-cyan-500/20 to-sky-500/5",
  },
  {
    icon: "🛡️",
    title: "自己資本比率ランキング",
    description: "返済不要の自己資本が総資産に占める割合で安全性を比較します。",
    href: "/ranking/equity-ratio",
    tone: "from-violet-500/20 to-purple-500/5",
  },
  {
    icon: "🔎",
    title: "リスクシグナルランキング",
    description: "決算データから注意して確認したい財務シグナルを比較します。",
    href: "/ranking/risk-signal",
    tone: "from-rose-500/20 to-red-500/5",
  },
] as const;

export default function RankingsPage() {
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),transparent_28%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-16">
        <section className="max-w-4xl">
          <p className="text-xs font-bold tracking-[0.3em] text-green-300">
            GROWTH MARKET RANKING
          </p>
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">
            決算ランキング一覧
          </h1>
          <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">
            グロース企業を、成長性・収益性・キャッシュ創出力・安全性・リスクシグナルの観点からランキング化しています。気になる指標から企業の決算を比べてみましょう。
          </p>
        </section>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rankings.map((ranking) => (
            <Link
              key={ranking.href}
              href={ranking.href}
              className={`group flex min-h-56 flex-col rounded-3xl border border-white/10 bg-gradient-to-br ${ranking.tone} p-6 backdrop-blur-xl transition hover:-translate-y-1 hover:border-green-400/40 hover:bg-white/10`}
            >
              <span className="text-3xl" aria-hidden="true">
                {ranking.icon}
              </span>
              <h2 className="mt-5 text-xl font-black sm:text-2xl">
                {ranking.title}
              </h2>
              <p className="mt-3 flex-1 text-sm leading-7 text-slate-300">
                {ranking.description}
              </p>
              <span className="mt-5 text-sm font-bold text-green-300">
                ランキングを見る <span className="transition group-hover:translate-x-1">→</span>
              </span>
            </Link>
          ))}
        </div>

        <section className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <h2 className="text-2xl font-black">ランキングの見方</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div>
              <p className="font-bold text-green-300">1. 指標を選ぶ</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                まずは知りたい観点に近いランキングを選びます。
              </p>
            </div>
            <div>
              <p className="font-bold text-green-300">2. 数字を比べる</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                順位だけでなく、企業ごとの数値やスコアの差も確認します。
              </p>
            </div>
            <div>
              <p className="font-bold text-green-300">3. 決算の中身を見る</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                企業名を選び、ほかの財務指標やリスクシグナルもあわせて確認します。
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#07111f] p-6 sm:p-8">
          <h2 className="text-2xl font-black">決算ランキングで見るべきポイント</h2>
          <div className="mt-5 space-y-4 leading-8 text-slate-300">
            <p>
              グロース企業の決算は、ひとつの指標だけで判断せず、売上成長率と営業利益率、営業CFを組み合わせて見ることが大切です。売上が伸びていても利益や現金が伴わない場合があるためです。
            </p>
            <p>
              自己資本比率で財務の安全性を確かめ、リスクシグナルで注意点を把握すると、企業ごとの強みと課題を立体的に比較できます。順位は企業を知る入口として活用し、最新の決算資料もあわせて確認してください。
            </p>
          </div>
        </section>

        <p className="mt-8 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-xs leading-6 text-slate-400">
          本ページは決算情報の理解を補助することを目的としており、特定の銘柄の売買を推奨するものではありません。投資判断はご自身の責任で行ってください。
        </p>
      </div>
    </main>
  );
}
