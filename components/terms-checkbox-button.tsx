"use client";

import { useState } from "react";

export default function TermsCheckboxButton({
  children,
}: {
  children: React.ReactNode;
}) {
  const [checked, setChecked] = useState(false);

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
          利用規約、プライバシーポリシー、免責事項、特定商取引法に基づく表記に同意します。
        </span>
      </label>

      <button
        disabled={!checked}
        className="mt-4 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-black text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {children}
      </button>
    </div>
  );
}