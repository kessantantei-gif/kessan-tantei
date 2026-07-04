import Link from "next/link";

export default function ProLock({
  title = "この機能はPro限定です",
  message = "AI詳細分析、S級銘柄、財務異変検知を見るにはProプラン登録が必要です。",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="rounded-3xl border border-yellow-400/30 bg-yellow-500/10 p-8 text-center">
      <p className="text-sm tracking-[0.25em] text-yellow-300">PRO ONLY</p>

      <h2 className="mt-4 text-3xl font-black">{title}</h2>

      <p className="mt-4 leading-7 text-slate-300">{message}</p>

      <Link
        href="/pricing"
        className="mt-6 inline-block rounded-2xl bg-yellow-400 px-6 py-4 font-black text-slate-950 hover:bg-yellow-300"
      >
        初月100円でProを開始
      </Link>
    </div>
  );
}