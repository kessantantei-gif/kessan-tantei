"use client";

import { SignInButton } from "@clerk/nextjs";

export default function LoginRequiredCard({
  message,
}: {
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-5">
      <p className="font-bold text-yellow-300">ログインが必要です</p>
      <p className="mt-2 text-sm leading-7 text-slate-300">{message}</p>

      <SignInButton mode="modal">
        <button className="mt-4 rounded-2xl bg-green-400 px-5 py-3 font-black text-slate-950 hover:bg-green-300">
          Googleでログイン
        </button>
      </SignInButton>
    </div>
  );
}