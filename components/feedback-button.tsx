"use client";

import { useState } from "react";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSending(true);
    setDone(false);

    const payload = {
      type: formData.get("type"),
      email: formData.get("email"),
      message: formData.get("message"),
    };

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    setSending(false);

    if (res.ok) {
      setDone(true);
    } else {
      alert("送信失敗");
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setDone(false);
          setOpen(true);
        }}
        className="fixed bottom-5 left-5 z-50 rounded-full bg-cyan-500 px-4 py-3 font-bold text-black"
      >
        💬 問い合わせ
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#07111f] p-6 text-white">
            <button
              onClick={() => setOpen(false)}
              className="mb-4 text-sm text-slate-400"
            >
              閉じる
            </button>

            {done ? (
              <div>
                <h2 className="text-2xl font-bold text-green-400">
                  送信完了しました
                </h2>
                <p className="mt-3 text-slate-300">
                  内容を受け付けました。権利侵害・違法投稿の申出については、対象投稿と申出内容を確認します。
                </p>
              </div>
            ) : (
              <form action={handleSubmit} className="grid gap-4">
                <div>
                  <label htmlFor="feedback-type" className="mb-2 block text-sm font-bold text-slate-300">
                    種別
                  </label>
                  <select
                    id="feedback-type"
                    name="type"
                    className="w-full rounded-xl bg-black/30 p-3"
                    defaultValue="改善要望"
                  >
                    <option>不具合</option>
                    <option>改善要望</option>
                    <option>問い合わせ</option>
                    <option>掲示板・権利侵害の通報</option>
                    <option>その他</option>
                  </select>
                </div>

                <input
                  name="email"
                  type="email"
                  placeholder="返信先メール（任意）"
                  className="rounded-xl bg-black/30 p-3"
                />

                <textarea
                  name="message"
                  required
                  maxLength={4000}
                  rows={6}
                  placeholder="掲示板の申出の場合：対象銘柄、投稿番号または投稿日時、ページURL、問題となる箇所、削除を求める理由を記載してください。"
                  className="rounded-xl bg-black/30 p-3"
                />

                <p className="text-xs leading-6 text-slate-500">
                  掲示板上の投稿は、各投稿の「通報」ボタンからも報告できます。権利侵害など詳細確認が必要な場合は、このフォームもご利用ください。
                </p>

                <button
                  disabled={sending}
                  className="rounded-xl bg-cyan-400 py-3 font-bold text-black disabled:opacity-50"
                >
                  {sending ? "送信中..." : "送信する"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
