import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import TermsSubmitButton from "@/components/terms-submit-button";
import { createCheckoutSession } from "./actions";

export default async function PricingPage() {
  const { userId } = await auth();

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black">
            決算探偵
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            ← ランキングへ
          </Link>
        </div>

        <div className="text-center">
          <p className="text-xs tracking-[0.25em] text-yellow-300">
            GROWTH MARKET PRO
          </p>
          <h1 className="mt-3 text-4xl font-black sm:text-6xl">
            決算探偵 Pro
          </h1>
          <p className="mt-5 text-slate-300">
            買う銘柄を探す前に、買ってはいけない銘柄を除外する。
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            グロース市場に潜む財務リスクと成長性を、会計士視点で可視化します。
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-7">
            <h2 className="text-3xl font-black">Free</h2>
            <p className="mt-3 text-5xl font-black">¥0</p>
            <p className="mt-2 text-slate-400">無料で使える基本機能</p>

            <ul className="mt-6 space-y-3 text-slate-300">
              <li>✅ グロース市場ランキング</li>
              <li>✅ 会社詳細の基本分析</li>
              <li>✅ ニュース閲覧</li>
              <li>✅ 掲示板投稿</li>
              <li>✅ ウォッチリスト3件</li>
              <li>✅ AI詳細分析3回まで</li>
            </ul>

            <Link
              href="/"
              className="mt-8 block rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-center font-black hover:bg-white/10"
            >
              無料で使う
            </Link>
          </div>

          <div className="rounded-3xl border border-yellow-400/30 bg-yellow-500/10 p-7 shadow-2xl shadow-yellow-950/30">
            <h2 className="text-3xl font-black text-yellow-300">Pro</h2>
            <p className="mt-3 text-5xl font-black">初月¥100</p>
            <p className="mt-2 text-slate-300">
              2ヶ月目以降 ¥980/月・いつでも解約可能
            </p>

            <ul className="mt-6 space-y-3 text-slate-300">
              <li>✅ AI詳細分析 無制限</li>
              <li>✅ S級銘柄一覧</li>
              <li>✅ 要注意銘柄一覧</li>
              <li>✅ 財務異変検知</li>
              <li>✅ ウォッチリスト無制限</li>
              <li>✅ 通知機能</li>
            </ul>

            <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-black/20 p-4 text-sm leading-7 text-slate-300">
              Proプランは月額サブスクリプションです。初月のみ100円、2ヶ月目以降は月額980円で自動更新されます。
            </div>

            <div className="mt-5 flex flex-wrap gap-3 text-sm text-yellow-200">
              <Link href="/terms" className="underline">利用規約</Link>
              <Link href="/privacy" className="underline">プライバシーポリシー</Link>
              <Link href="/disclaimer" className="underline">免責事項</Link>
              <Link href="/legal" className="underline">特商法表記</Link>
            </div>

            {userId ? (
              <form action={createCheckoutSession}>
                <TermsSubmitButton />
              </form>
            ) : (
              <Link
                href="/"
                className="mt-8 block rounded-2xl bg-yellow-400 px-5 py-4 text-center font-black text-slate-950 hover:bg-yellow-300"
              >
                まずログインしてください
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}