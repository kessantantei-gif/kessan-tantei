import Link from "next/link";

export default function ProLock({
  title = "この機能はPro限定です",
  message = "AI詳細分析、S級銘柄、財務異変検知を見るにはProプラン登録が必要です。",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-yellow-300/35 bg-gradient-to-br from-yellow-400/20 via-yellow-400/10 to-white/[0.03] p-[1px] shadow-2xl shadow-yellow-950/20">
      <div className="rounded-3xl bg-[#080b14]/92 p-6 text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-300/30 bg-yellow-400/15 text-2xl shadow-inner shadow-yellow-950/20">
          🔒
        </div>

        <p className="mt-5 text-xs font-black tracking-[0.28em] text-yellow-200">
          PRO ONLY
        </p>

        <h2 className="mx-auto mt-3 max-w-2xl text-2xl font-black leading-tight text-white sm:text-3xl">
          {title}
        </h2>

        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
          {message}
        </p>

        <div className="mx-auto mt-6 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
          {[
            "ランキング4位以降を確認",
            "企業ごとの詳細財務分析",
            "Danger内訳とRed Flags",
            "決算変化速報を確認",
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-yellow-50"
            >
              ✓ {item}
            </div>
          ))}
        </div>

        <Link
          href="/pricing"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-yellow-400 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-300 active:scale-95 sm:w-auto sm:text-base"
        >
          初月100円で続きを見る
        </Link>

        <p className="mt-3 text-xs leading-6 text-slate-500">
          決算探偵は投資助言ではなく、決算情報の理解を補助する分析ツールです。
        </p>
      </div>
    </div>
  );
}
