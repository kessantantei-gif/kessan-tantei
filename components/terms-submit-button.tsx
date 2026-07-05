"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Spinner from "@/components/spinner";

function InnerButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="mt-4 flex min-h-14 w-full items-center justify-center rounded-full bg-yellow-400 px-6 py-4 text-base font-black text-slate-950 shadow-2xl shadow-yellow-950/25 transition hover:bg-yellow-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
    >
      <span className="flex items-center justify-center gap-2">
        {pending ? (
          <>
            <Spinner />
            決済ページへ移動中...
          </>
        ) : (
          "初月100円でProを始める"
        )}
      </span>
    </button>
  );
}

export default function TermsSubmitButton() {
  const [checked, setChecked] = useState(false);

  return (
    <div className="mt-6 rounded-3xl border border-yellow-300/30 bg-yellow-400/10 p-4 sm:p-5">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-7 text-slate-300 transition hover:bg-black/35">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-4 w-4 accent-yellow-400"
        />
        <span>
          <Link href="/terms" className="font-bold text-yellow-100 underline underline-offset-4">利用規約</Link>、
          <Link href="/privacy" className="font-bold text-yellow-100 underline underline-offset-4">プライバシーポリシー</Link>、
          <Link href="/disclaimer" className="font-bold text-yellow-100 underline underline-offset-4">免責事項</Link>、
          <Link href="/legal" className="font-bold text-yellow-100 underline underline-offset-4">特定商取引法に基づく表記</Link>
          に同意します。
        </span>
      </label>

      {checked ? (
        <>
          <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-500/10 px-4 py-3 text-sm font-bold text-green-200">
            ✓ 同意済みです。安全な決済ページへ進めます。
          </div>
          <InnerButton />
        </>
      ) : (
        <button
          disabled
          className="mt-4 flex min-h-14 w-full cursor-not-allowed items-center justify-center rounded-full bg-yellow-400 px-6 py-4 text-base font-black text-slate-950 opacity-45"
        >
          同意すると決済へ進めます
        </button>
      )}

      <p className="mt-3 text-center text-xs leading-6 text-slate-500">
        初月100円。2ヶ月目以降は月額980円で自動更新され、いつでも解約できます。
      </p>
    </div>
  );
}
