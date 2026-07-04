"use client";

import { useState } from "react";

export default function UpgradeButton() {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    try {
      setLoading(true);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("決済ページ生成に失敗しました");
      }
    } catch (error) {
      alert("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleUpgrade}
      disabled={loading}
      className="rounded-2xl bg-yellow-400 px-6 py-4 font-black text-black hover:bg-yellow-300 disabled:opacity-50"
    >
      {loading ? "読み込み中..." : "PROにアップグレード（月980円）"}
    </button>
  );
}