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
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-50 rounded-full bg-cyan-500 px-4 py-3 font-bold text-black"
      >
        💬 Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
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
                  送信完了しました！
                </h2>
                <p className="mt-3 text-slate-300">
                  ご意見ありがとうございます。
                </p>
              </div>
            ) : (
              <form action={handleSubmit} className="grid gap-4">
                <select
                  name="type"
                  className="rounded-xl bg-black/30 p-3"
                  defaultValue="改善要望"
                >
                  <option>不具合</option>
                  <option>改善要望</option>
                  <option>問い合わせ</option>
                  <option>その他</option>
                </select>

                <input
                  name="email"
                  type="email"
                  placeholder="返信先メール（任意）"
                  className="rounded-xl bg-black/30 p-3"
                />

                <textarea
                  name="message"
                  required
                  rows={6}
                  placeholder="内容"
                  className="rounded-xl bg-black/30 p-3"
                />

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