"use client";

import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

export default function AuthButton() {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 sm:bottom-5 sm:right-5">
      <Show when="signed-out">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/65 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <Link
            href="/pricing"
            className="hidden rounded-full border border-yellow-300/30 bg-yellow-400/15 px-4 py-2.5 text-xs font-black text-yellow-100 transition hover:bg-yellow-400/25 active:scale-95 sm:inline-flex"
          >
            初月100円Pro
          </Link>

          <SignInButton mode="modal">
            <button className="rounded-full border border-green-400/30 bg-green-400 px-4 py-2.5 text-xs font-black text-slate-950 shadow-xl transition hover:bg-green-300 active:scale-95 sm:px-5 sm:text-sm">
              Googleでログイン
            </button>
          </SignInButton>
        </div>
      </Show>

      <Show when="signed-in">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/65 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <Link
            href="/pricing"
            className="rounded-full border border-yellow-300/30 bg-yellow-400/15 px-4 py-2.5 text-xs font-black text-yellow-100 transition hover:bg-yellow-400/25 active:scale-95 sm:text-sm"
          >
            Pro
          </Link>

          <Link
            href="/profile"
            className="rounded-full border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/15 active:scale-95 sm:text-sm"
          >
            プロフィール
          </Link>

          <div className="rounded-full border border-white/10 bg-black/60 p-2 shadow-xl backdrop-blur">
            <UserButton />
          </div>
        </div>
      </Show>
    </div>
  );
}
