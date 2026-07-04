"use client";

import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

export default function AuthButton() {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="rounded-full border border-green-400/30 bg-green-400 px-5 py-3 text-sm font-black text-slate-950 shadow-xl hover:bg-green-300">
            Googleでログイン
          </button>
        </SignInButton>
      </Show>

      <Show when="signed-in">
        <Link
          href="/profile"
          className="rounded-full border border-white/10 bg-black/60 px-4 py-3 text-sm font-bold text-white shadow-xl backdrop-blur hover:bg-white/10"
        >
          プロフィール
        </Link>
        <div className="rounded-full border border-white/10 bg-black/60 p-2 shadow-xl backdrop-blur">
          <UserButton />
        </div>
      </Show>
    </div>
  );
}