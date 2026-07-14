import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CommentRow = Record<string, unknown>;

function text(row: CommentRow, keys: string[]) {
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

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  if (!(await isAdminUser())) redirect("/");

  const { userId: encodedUserId } = await params;
  const userId = decodeURIComponent(encodedUserId);

  const [{ data: profile, error: profileError }, { data: allComments, error: commentsError }] =
    await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("clerk_user_id", userId).maybeSingle(),
      supabaseAdmin.from("company_comments").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);

  if (profileError) {
    return (
      <main className="min-h-screen bg-[#050816] p-8 text-white">
        <p className="text-red-200">ユーザー情報の取得に失敗しました: {profileError.message}</p>
      </main>
    );
  }

  const comments = ((allComments ?? []) as CommentRow[]).filter((comment) => {
    const authorId = text(comment, ["clerk_user_id", "user_id", "author_id", "profile_id"]);
    return authorId === userId;
  });

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/users" className="text-sm font-bold text-slate-400 hover:text-white">
          ← ユーザー一覧へ
        </Link>

        <header className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.3em] text-violet-300">USER DETAIL</p>
          <h1 className="mt-2 text-3xl font-black">{profile?.display_name || "No Name"}</h1>
          <p className="mt-2 break-all text-sm text-slate-500">{userId}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-black/20 p-4">
              <p className="text-xs text-slate-500">プラン</p>
              <p className="mt-1 font-black text-yellow-200">{profile?.plan || "free"}</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-4">
              <p className="text-xs text-slate-500">契約状態</p>
              <p className="mt-1 font-black">{profile?.subscription_status || "-"}</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-4">
              <p className="text-xs text-slate-500">権限</p>
              <p className="mt-1 font-black">{profile?.role || "user"}</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-4">
              <p className="text-xs text-slate-500">投稿数</p>
              <p className="mt-1 font-black text-cyan-200">{comments.length}</p>
            </div>
          </div>
        </header>

        <section className="mt-8">
          <h2 className="text-2xl font-black">このユーザーの投稿</h2>
          {commentsError ? (
            <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
              投稿の取得に失敗しました: {commentsError.message}
            </p>
          ) : comments.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-400">投稿はありません。</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {comments.map((comment, index) => {
                const id = text(comment, ["id", "comment_id"]) || String(index);
                const ticker = text(comment, ["ticker", "company_ticker"]);
                const body = text(comment, ["content", "body", "comment", "text"]);
                return (
                  <article key={id} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-black text-cyan-200">{ticker ? `${ticker} の掲示板` : "掲示板投稿"}</p>
                      <p className="text-xs text-slate-500">{formatDate(comment.created_at)}</p>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap break-words leading-7 text-slate-200">{body || "本文を取得できませんでした。"}</p>
                    {ticker && (
                      <Link
                        href={`/company/${encodeURIComponent(ticker)}#comments`}
                        className="mt-4 inline-flex text-sm font-black text-violet-300 hover:text-violet-200"
                      >
                        銘柄ページで見る →
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
