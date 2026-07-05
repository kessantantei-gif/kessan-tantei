"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";

export default function LoginRequiredCard({
  message,
}: {
  message: string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-green-300/30 bg-gradient-to-br from-green-400/16 via-green-400/8 to-white/[0.03] p-[1px] shadow-2xl shadow-green-950/20">
      <div className="rounded-3xl bg-[#080b14]/92 p-6 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.28em] text-green-300">
              LOGIN REQUIRED
            </p>
            <h2 className="mt-3 text-2xl font-black text-white">
              ログインすると続きが見られます
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              {message}
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:min-w-48">
            <SignInButton mode="modal">
              <button className="inline-flex min-h-12 items-center justify-center rounded-full bg-green-400 px-5 py-3 text-sm font-black text-slate-950 shadow-xl shadow-green-950/20 transition hover:bg-green-300 active:scale-95">
                Googleでログイン
              </button>
            </SignInButton>

            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-yellow-300/30 bg-yellow-400/10 px-5 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/20 active:scale-95"
            >
              Proを見る
            </Link>
          </div>
        </div>

        <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-slate-500">
          決算探偵は、決算情報の理解を補助する分析ツールです。特定銘柄の売買を推奨するものではありません。
        </p>
      </div>
    </div>
  );
}
