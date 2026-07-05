"use client";

import { useMemo, useRef, useState } from "react";
import FormSubmitButton from "@/components/form-submit-button";
import LoginRequiredCard from "@/components/login-required-card";
import {
  createComment,
  deleteComment,
  reactComment,
} from "@/app/company/[ticker]/actions";

export type BoardComment = {
  id: string;
  ticker: string;
  nickname: string;
  body: string;
  created_at: string;
  clerk_user_id?: string | null;
  reply_to_id?: string | null;
  deleted_at?: string | null;
  likeCount: number;
  reportCount: number;
  likedByMe: boolean;
  reportedByMe: boolean;
};

type CompanyBoardProps = {
  ticker: string;
  companyName: string;
  comments: BoardComment[];
  isLoggedIn: boolean;
  currentUserId: string | null;
};

const AUTO_HIDE_REPORT_THRESHOLD = 3;

function formatDate(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CompanyBoard({
  ticker,
  companyName,
  comments,
  isLoggedIn,
  currentUserId,
}: CompanyBoardProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [replyToId, setReplyToId] = useState("");
  const [replyLabel, setReplyLabel] = useState("");
  const [body, setBody] = useState("");

  const activeCommentsCount = comments.filter(
    (comment) => !comment.deleted_at && comment.reportCount < AUTO_HIDE_REPORT_THRESHOLD
  ).length;

  const numberById = useMemo(() => {
    const map = new Map<string, number>();

    comments.forEach((comment, index) => {
      map.set(comment.id, comments.length - index);
    });

    return map;
  }, [comments]);

  const commentById = useMemo(() => {
    const map = new Map<string, BoardComment>();

    comments.forEach((comment) => {
      map.set(comment.id, comment);
    });

    return map;
  }, [comments]);

  function startReply(comment: BoardComment) {
    const number = numberById.get(comment.id) ?? 0;
    const label = `>>${number} ${comment.nickname}さん`;

    setReplyToId(comment.id);
    setReplyLabel(label);
    setBody((current) => {
      if (current.trim()) return `${label}\n${current}`;
      return `${label}\n`;
    });

    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  }

  function cancelReply() {
    setReplyToId("");
    setReplyLabel("");
    setBody("");
  }

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.28em] text-cyan-300 sm:text-sm">
            COMMUNITY BOARD
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            {companyName} 掲示板
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            決算を読んだ感想や気になる論点を残せます。投稿内容は投資助言ではなく、ユーザー同士の情報交換です。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-300">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
            最新50件
          </span>
          <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-cyan-200">
            表示中 {activeCommentsCount}件
          </span>
        </div>
      </div>

      {isLoggedIn ? (
        <form action={createComment} className="mt-6 grid gap-3">
          <input type="hidden" name="ticker" value={ticker} />
          <input type="hidden" name="reply_to_id" value={replyToId} />

          <div className="rounded-2xl border border-green-400/20 bg-green-500/10 p-4 text-sm leading-7 text-green-200">
            ✓ ログイン中です。投稿名はプロフィールの表示名が使われます。
          </div>

          {replyToId ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-cyan-300">
                {replyLabel} へ返信中
              </p>
              <button
                type="button"
                onClick={cancelReply}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 active:scale-95"
              >
                返信をやめる
              </button>
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="この会社についてコメントする。例：営業CFが改善している点が気になる、リスクシグナルの内容を確認したい など"
            maxLength={1000}
            required
            rows={4}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-green-400/60 focus:bg-black/40"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-6 text-slate-500">
              最大1,000文字。誹謗中傷や根拠のない断定は避けてください。
            </p>
            <FormSubmitButton
              pendingText="投稿中..."
              className="rounded-full bg-green-400 px-6 py-3 font-black text-slate-950 transition hover:bg-green-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              投稿する
            </FormSubmitButton>
          </div>
        </form>
      ) : (
        <div className="mt-6">
          <LoginRequiredCard message="ログインすると、この企業へのコメント投稿、返信、いいね、通報ができます。" />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {comments.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-slate-400">
            <p className="text-lg font-bold text-white">まだコメントはありません</p>
            <p className="mt-2 text-sm leading-7">
              決算を読んで気になった点を最初に投稿してみましょう。
            </p>
          </div>
        ) : (
          comments.map((comment, index) => {
            const number = comments.length - index;
            const replyTo = comment.reply_to_id
              ? commentById.get(comment.reply_to_id)
              : null;
            const replyNumber = comment.reply_to_id
              ? numberById.get(comment.reply_to_id)
              : null;

            const isDeleted = Boolean(comment.deleted_at);
            const isMine =
              Boolean(currentUserId) && comment.clerk_user_id === currentUserId;
            const isAutoHidden =
              !isDeleted &&
              !isMine &&
              comment.reportCount >= AUTO_HIDE_REPORT_THRESHOLD;

            const canDelete =
              isLoggedIn &&
              !isDeleted &&
              currentUserId &&
              comment.clerk_user_id === currentUserId;

            return (
              <div
                key={comment.id}
                id={`comment-${comment.id}`}
                className={`rounded-2xl border p-4 transition ${
                  isDeleted || isAutoHidden
                    ? "border-white/5 bg-black/10 opacity-70"
                    : isMine
                    ? "border-green-400/20 bg-green-500/10"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-slate-300">
                      No.{number}
                    </span>
                    {isMine ? (
                      <span className="rounded-full border border-green-400/20 bg-green-500/10 px-3 py-1 text-xs font-black text-green-200">
                        自分の投稿
                      </span>
                    ) : null}
                    <p className="font-bold text-green-300">
                      {isDeleted
                        ? "削除済み"
                        : isAutoHidden
                        ? "非表示"
                        : comment.nickname}
                    </p>
                  </div>

                  <p className="text-xs text-slate-500">
                    {formatDate(comment.created_at)}
                  </p>
                </div>

                {replyTo && replyNumber && !isAutoHidden ? (
                  <a
                    href={`#comment-${replyTo.id}`}
                    className="mt-3 inline-block rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm font-bold text-cyan-300 transition hover:bg-cyan-500/20"
                  >
                    &gt;&gt;{replyNumber} {replyTo.nickname}さんへの返信
                  </a>
                ) : null}

                {isDeleted ? (
                  <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-500">
                    この投稿は削除されました。
                  </p>
                ) : isAutoHidden ? (
                  <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">
                    通報が一定数に達したため、この投稿は非表示になりました。
                  </p>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-300">
                    {comment.body}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {isLoggedIn && !isDeleted && !isAutoHidden ? (
                    <>
                      <button
                        type="button"
                        onClick={() => startReply(comment)}
                        className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-sm font-bold text-cyan-300 transition hover:bg-cyan-500/20 active:scale-95"
                      >
                        返信
                      </button>

                      <form action={reactComment}>
                        <input type="hidden" name="ticker" value={ticker} />
                        <input type="hidden" name="comment_id" value={comment.id} />
                        <input type="hidden" name="reaction_type" value="like" />
                        <FormSubmitButton
                          pendingText="処理中..."
                          className={`rounded-full border px-3 py-1.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            comment.likedByMe
                              ? "border-green-300 bg-green-400 text-slate-950 shadow-lg shadow-green-500/20"
                              : "border-green-400/20 bg-green-500/10 text-green-300 hover:bg-green-500/20"
                          }`}
                        >
                          👍 {comment.likeCount}
                        </FormSubmitButton>
                      </form>

                      <form action={reactComment}>
                        <input type="hidden" name="ticker" value={ticker} />
                        <input type="hidden" name="comment_id" value={comment.id} />
                        <input type="hidden" name="reaction_type" value="report" />
                        <FormSubmitButton
                          pendingText="処理中..."
                          className={`rounded-full border px-3 py-1.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            comment.reportedByMe
                              ? "border-red-300 bg-red-400 text-slate-950 shadow-lg shadow-red-500/20"
                              : "border-red-400/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                          }`}
                        >
                          🚨 通報 {comment.reportCount}
                        </FormSubmitButton>
                      </form>

                      {canDelete ? (
                        <form action={deleteComment}>
                          <input type="hidden" name="ticker" value={ticker} />
                          <input type="hidden" name="comment_id" value={comment.id} />
                          <FormSubmitButton
                            pendingText="削除中..."
                            className="rounded-full border border-slate-400/20 bg-slate-500/10 px-3 py-1.5 text-sm font-bold text-slate-300 transition hover:bg-slate-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            削除
                          </FormSubmitButton>
                        </form>
                      ) : null}
                    </>
                  ) : isLoggedIn ? (
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-400">
                      操作できません
                    </div>
                  ) : (
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-400">
                      ログインで返信 / 👍 / 通報
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
