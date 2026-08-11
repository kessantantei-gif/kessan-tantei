import Link from "next/link";

const verdicts = [
  ["良好", "Financial Score 80以上・Danger Score 30未満を中心に判定"],
  ["標準", "強い警戒条件に該当せず、良好条件にも達しない場合"],
  ["要確認", "Danger Score 40以上、Financial Score 60未満、WATCH/WARNING等"],
  ["警戒", "Danger Score 60以上、Financial Score 40未満、DANGEROUS等"],
  ["高リスク", "Danger Score 80以上またはREJECT判定"],
];

export default function AboutGrowthPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black">
            決算探偵
          </Link>
          <Link href="/ranking" className="text-sm text-slate-400 hover:text-white">
            ← ランキング
          </Link>
        </div>

        <p className="text-xs font-black tracking-[0.25em] text-green-300">
          METHODOLOGY / GROWTH MARKET
        </p>

        <h1 className="mt-3 text-4xl font-black sm:text-6xl">
          スコアと判定の
          <br />
          共通ルール
        </h1>

        <p className="mt-6 max-w-4xl text-base leading-8 text-slate-300 sm:text-lg">
          グロース市場の企業を、取得済みの公式開示データと固定ルールで比較します。文章の印象ではなく、数値・警戒フラグ・比較条件から判定します。
        </p>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-green-400/20 bg-green-500/10 p-6">
            <p className="text-xs font-black tracking-[0.2em] text-green-200">
              FINANCIAL SCORE
            </p>
            <h2 className="mt-2 text-2xl font-black">0 - 100</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              成長力・収益品質・安全性をまとめた総合スコアです。企業ページでは各構成スコアも表示します。
            </p>
          </div>

          <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6">
            <p className="text-xs font-black tracking-[0.2em] text-red-200">
              DANGER SCORE
            </p>
            <h2 className="mt-2 text-2xl font-black">0 - 100</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              資金繰り、希薄化、継続企業注記、営業CF悪化などの警戒シグナルを集計します。
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.2em] text-cyan-300">
            FINANCIAL SIGNALS
          </p>
          <h2 className="mt-2 text-2xl font-black">主な確認項目</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "売上成長率",
              "営業利益・営業利益率",
              "営業CF・営業CF率",
              "自己資本比率",
              "四半期・前期比較",
              "資金調達・希薄化",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-bold text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.2em] text-yellow-300">
            VERDICT RULES
          </p>
          <h2 className="mt-2 text-2xl font-black">企業ページの判定</h2>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            {verdicts.map(([label, rule], index) => (
              <div
                key={label}
                className={`grid gap-2 p-4 sm:grid-cols-[120px_1fr] ${
                  index > 0 ? "border-t border-white/10" : ""
                }`}
              >
                <p className="font-black text-white">{label}</p>
                <p className="text-sm leading-6 text-slate-400">{rule}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-500">
            個別のrisk levelや重大フラグがある場合は、Danger Scoreだけでなくその条件も判定に反映します。
          </p>
        </section>

        <section className="mt-8 rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.2em] text-yellow-200">
            RISK SIGNALS
          </p>
          <h2 className="mt-2 text-2xl font-black">主な警戒項目</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 text-sm text-slate-200">
            <li className="rounded-2xl bg-black/20 p-4">営業CFマイナス・悪化</li>
            <li className="rounded-2xl bg-black/20 p-4">増資・新株予約権・MSワラント</li>
            <li className="rounded-2xl bg-black/20 p-4">継続企業の前提に関する注記</li>
            <li className="rounded-2xl bg-black/20 p-4">低自己資本比率・資金繰り</li>
          </ul>
        </section>

        <section className="mt-8 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-6 sm:p-8">
          <h2 className="text-2xl font-black">表示フォーマット</h2>
          <p className="mt-3 leading-8 text-slate-300">
            企業ページは「判定 → プラス材料 → 警戒材料 → 次回確認 → 判定根拠」の順に固定しています。同じ項目を同じ順番で確認できることを優先します。
          </p>
        </section>

        <p className="mt-8 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-xs leading-6 text-slate-400">
          各スコア・判定は取得済みデータに基づく情報整理であり、特定銘柄の売買推奨ではありません。
        </p>
      </div>
    </main>
  );
}
