"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Spinner from "@/components/spinner";

function InnerButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="mt-4 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-black text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={pending}
    >
      <span className="flex items-center justify-center gap-2">
        {pending ? (
          <>
            <Spinner />
            決済ページへ移動中...
          </>
        ) : (
          "初月100円でProを開始"
        )}
      </span>
    </button>
  );
}

export default function TermsSubmitButton() {
  const [checked, setChecked] = useState(false);

  if (!checked) {
    return (
      <div className="mt-6">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-300">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            <Link href="/terms" className="underline">利用規約</Link>、
            <Link href="/privacy" className="underline">プライバシーポリシー</Link>、
            <Link href="/disclaimer" className="underline">免責事項</Link>、
            <Link href="/legal" className="underline">特定商取引法に基づく表記</Link>
            に同意します。
          </span>
        </label>

        <button
          disabled
          className="mt-4 w-full cursor-not-allowed rounded-2xl bg-yellow-400 px-5 py-4 font-black text-slate-950 opacity-40"
        >
          同意すると決済へ進めます
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-4 text-sm leading-7 text-yellow-100">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          利用規約・プライバシーポリシー・免責事項・特商法表記に同意しました。
        </span>
      </label>

      <InnerButton />
    </div>
  );
}