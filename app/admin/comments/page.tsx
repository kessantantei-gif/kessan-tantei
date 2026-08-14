import Link from "next/link";
import { redirect } from "next/navigation";
import { adminHideComment } from "@/app/admin/comments/actions";
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

export default async function AdminCommentsPage() {
  if (!(await isAdminUser())) redirect("/");

  const [{ data: comments, error }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("company_comments").select("*").order("created_at", { ascending: false }).limit(1000),
    supabaseAdmin.from("profiles").select("clerk_user_id, display_name").limit(1000),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.clerk_user_id, profile.display_name || "No Name"])
  );
  const rows = (comments ?? []) as Row[];

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-xs font-black tracking-[0.3em] text-cyan-300">BOARD COMMENTS</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">掲示板投稿</h1>
          <p className="mt-3 text-slate-400">
            投稿者、本文、対象銘柄を確認し、違法・権利侵害・規約違反が疑われる投稿を管理者判断で非表示にできます。
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
            <Link href="/admin/reports" className="rounded-full border border-red-300/20 bg-red-400/10 px-4 py-2 text-red-200">
              通報された投稿を見る
            </Link>
            <Link href="/community-guidelines" className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-cyan-200">
              掲示板ガイドライン
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
            投稿の取得に失敗しました: {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">投稿はありません。</div>
        ) : (
          <div className="grid gap-4">
            {rows.map((comment, index) => {
              const id = text(comment, ["id", "comment_id"]) || String(index);
              const ticker = text(comment, ["ticker", "company_ticker"]);
              const userId = text(comment, ["clerk_user_id", "user_id", "author_id", "profile_id"]);
              const authorName = text(comment, ["display_name", "author_name", "user_name"]) || profileMap.get(userId) || "不明";
              const body = text(comment, ["content", "body", "comment", "text"]);
              const deletedAt = text(comment, ["deleted_at"]);
              const deletedBy = text(comment, ["deleted_by"]);
              const isDeleted = Boolean(deletedAt);

              return (
                <article
                  key={id}
                  className={`rounded-3xl border p-6 ${
                    isDeleted
                      ? "border-slate-500/20 bg-slate-500/5 opacity-75"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-cyan-200">{ticker ? `${ticker} の掲示板` : "掲示板投稿"}</p>
                        {isDeleted ? (
                          <span className="rounded-full border border-slate-400/20 bg-slate-400/10 px-3 py-1 text-xs font-black text-slate-300">
                            非表示済み
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-400">投稿者: {authorName}</p>
                      {isDeleted ? (
                        <p className="mt-1 text-xs text-slate-500">
                          非表示: {formatDate(deletedAt)} / 処理者: {deletedBy || "不明"}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">投稿: {formatDate(comment.created_at)}</p>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-white/5 bg-black/15 p-4 leading-7 text-slate-200">
                    {body || "本文を取得できませんでした。"}
                  </p>

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
                        銘柄ページで見る
                      </Link>
                    )}
                    {!isDeleted && id ? (
                      <form action={adminHideComment}>
                        <input type="hidden" name="comment_id" value={id} />
                        <button
                          type="submit"
                          className="rounded-full border border-red-300/30 bg-red-400/10 px-4 py-2 text-xs font-black text-red-200 hover:bg-red-400/20"
                        >
                          管理者判断で非表示
                        </button>
                      </form>
                    ) : null}
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
