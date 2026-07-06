import Link from "next/link";
import type { ProStatus } from "@/lib/pro";

export default function ProStatusCard({ status }: { status: ProStatus }) {
  if (!status.isLoggedIn) {
    return (
      <div className="rounded-3xl border border-yellow-300/20 bg-yellow-500/10 p-5 sm:p-6">
        <p className="text-xs font-black tracking-[0.24em] text-yellow-200">ACCOUNT</p>
        <h2 className="mt-2 text-2xl font-black text-white">ログインするとPro登録できます</h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          右下のログインボタンからGoogleログイン後、Pro登録に進めます。
        </p>
        <Link href="/pricing" className="mt-5 inline-flex rounded-full bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300">
          Proプランを見る
        </Link>
      </div>
    );
  }

  if (status.isPro) {
    return (
      <div className="rounded-3xl border border-green-300/20 bg-green-500/10 p-5 sm:p-6">
        <p className="text-xs font-black tracking-[0.24em] text-green-200">PRO ACTIVE</p>
        <h2 className="mt-2 text-2xl font-black text-white">Pro利用中です</h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          ランキング全順位、Pro分析、詳細コメントなどのPro機能を利用できます。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
      <p className="text-xs font-black tracking-[0.24em] text-slate-400">FREE ACCOUNT</p>
      <h2 className="mt-2 text-2xl font-black text-white">現在はFreeプランです</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">
        Proにすると、ランキング全順位・Pro分析・詳細コメントを確認できます。
      </p>
      <Link href="/pricing" className="mt-5 inline-flex rounded-full bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300">
        初月100円でProを見る
      </Link>
    </div>
  );
}
