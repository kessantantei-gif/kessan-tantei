import Link from "next/link";

export default function AboutGrowthPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black">
            決算探偵
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            ← ランキングへ
          </Link>
        </div>

        <p className="text-xs tracking-[0.25em] text-green-300">
          WHY GROWTH MARKET
        </p>

        <h1 className="mt-3 text-4xl font-black sm:text-6xl">
          なぜグロース市場に
          <br />
          特化するのか
        </h1>

        <div className="mt-10 space-y-6 text-lg leading-9 text-slate-300">
          <p>
            決算探偵は、東証グロース市場に上場する企業だけを対象にしています。
          </p>

          <p>
            グロース企業は売上成長が大きい一方で、赤字・営業CFマイナス・増資・希薄化など、財務リスクも大きくなりやすい市場です。
          </p>

          <div className="rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-6">
            <ul className="space-y-3">
              <li>⚠ 売上成長は高いが営業CFが赤字</li>
              <li>⚠ 増資や新株予約権で希薄化が進む</li>
              <li>⚠ MSワラントの発行</li>
              <li>⚠ 監査法人交代</li>
              <li>⚠ 継続企業注記</li>
            </ul>
          </div>

          <p>
            決算探偵は、買いを煽るサイトではありません。グロース市場に潜む財務リスクと成長性を、会計士視点で可視化する分析サイトです。
          </p>

          <div className="rounded-3xl border border-green-400/20 bg-green-500/10 p-6">
            <ul className="space-y-3">
              <li>✅ 成長性</li>
              <li>✅ 収益品質</li>
              <li>✅ 営業CF</li>
              <li>✅ 財務安全性</li>
              <li>✅ Red Flags</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-7 text-center">
            <p className="text-2xl font-black text-cyan-300">
              グロース市場を、
              <br />
              決算から見抜く。
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}