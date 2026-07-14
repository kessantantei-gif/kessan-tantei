import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function text(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminReportsPage() {
  if (!(await isAdminUser())) redirect("/");

  const [{ data: reactions, error: reactionError }, { data: comments, error: commentError }, { data: profiles }] =
    await Promise.all([
      supabaseAdmin
        .from("company_comment_reactions")
        .select("*")
        .eq("reaction_type", "report")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabaseAdmin.from("company_comments").select("*").order("created_at", { ascending: false }).limit(1000),
      supabaseAdmin.from("profiles").select("clerk_user_id, display_name").limit(1000),
    ]);

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.clerk_user_id, profile.display_name || "No Name"])
  );
  const commentRows = (comments ?? []) as Row[];
  const reactionRows = (reactions ?? []) as Row[];
  const reportsByComment = new Map<string, Row[]>();

  for (const reaction of reactionRows) {
    const commentId = text(reaction, ["comment_id"]);
    if (!commentId) continue;
    const current = reportsByComment.get(commentId) ?? [];
    current.push(reaction);
    reportsByComment.set(commentId, current);
  }

  const reportedComments = commentRows
    .map((comment) => {
      const id = text(comment, ["id", "comment_id"]);
      return { comment, id, reports: reportsByComment.get(id) ?? [] };
    })
    .filter((item) => item.reports.length > 0)
    .sort((a, b) => b.reports.length - a.reports.length);

  const loadError = reactionError?.message || commentError?.message;

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-xs font-black tracking-[0.3em] text-red-300">REPORTS</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">通報コメント</h1>
          <p className="mt-3 text-slate-400">通報された本文、投稿者、対象銘柄、通報数を確認できます。</p>
        </header>

        {loadError ? (
          <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
            通報情報の取得に失敗しました: {loadError}
          </div>
        ) : reportedComments.length === 0 ? (
          <div className="rounded-3xl border border-green-400/20 bg-green-500/10 p-8 text-center text-green-100">
            現在、通報されたコメントはありません。
          </div>
        ) : (
          <div className="grid gap-5">
            {reportedComments.map(({ comment, id, reports }) => {
              const ticker = text(comment, ["ticker", "company_ticker"]);
              const userId = text(comment, ["clerk_user_id", "user_id", "author_id", "profile_id"]);
              const authorName = text(comment, ["display_name", "author_name", "user_name"]) || profileMap.get(userId) || "不明";
              const body = text(comment, ["content", "body", "comment", "text"]);

              return (
                <article key={id} className="rounded-3xl border border-red-400/25 bg-red-500/10 p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-red-400 px-3 py-1 text-xs font-black text-slate-950">
                          通報 {reports.length}件
                        </span>
                        <p className="font-black text-red-100">{ticker ? `${ticker} の掲示板` : "掲示板投稿"}</p>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">投稿者: {authorName}</p>
                    </div>
                    <p className="text-xs text-slate-500">投稿: {formatDate(comment.created_at)}</p>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
                    <p className="whitespace-pre-wrap break-words leading-7 text-white">{body || "本文を取得できませんでした。"}</p>
                  </div>

                  <div className="mt-4 rounded-2xl bg-black/15 p-4">
                    <p className="text-xs font-black tracking-[0.2em] text-red-200">通報履歴</p>
                    <div className="mt-3 grid gap-2">
                      {reports.map((report, index) => {
                        const reporterId = text(report, ["clerk_user_id", "user_id", "reporter_id"]);
                        const reason = text(report, ["reason", "content", "note"]);
                        return (
                          <div key={`${id}-${index}`} className="flex flex-col gap-1 text-sm text-slate-300 sm:flex-row sm:justify-between">
                            <span>通報者: {profileMap.get(reporterId) || reporterId || "不明"}</span>
                            <span>{reason || "理由未入力"} / {formatDate(report.created_at)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {userId && (
                      <Link
                        href={`/admin/users/${encodeURIComponent(userId)}`}
                        className="rounded-full border border-violet-300/30 bg-violet-400/10 px-4 py-2 text-xs font-black text-violet-200 hover:bg-violet-400/20"
                      >
                        投稿者を見る
                      </Link>
                    )}
                    {ticker && (
                      <Link
                        href={`/company/${encodeURIComponent(ticker)}#comments`}
                        className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-400/20"
                      >
                        銘柄ページで確認
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
