import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminUsersPage() {
  if (!(await isAdminUser())) redirect("/");

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(
      "clerk_user_id, display_name, plan, subscription_status, role, stripe_customer_id, stripe_subscription_id, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const users = data ?? [];

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-xs font-black tracking-[0.3em] text-violet-300">USERS</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">ユーザー管理</h1>
          <p className="mt-3 text-slate-400">登録者、契約状況、権限を確認できます。</p>
        </header>

        {error ? (
          <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
            ユーザー情報の取得に失敗しました: {error.message}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs text-slate-400">
                  <tr>
                    <th className="px-5 py-4">ユーザー</th>
                    <th className="px-5 py-4">プラン</th>
                    <th className="px-5 py-4">契約状態</th>
                    <th className="px-5 py-4">権限</th>
                    <th className="px-5 py-4">登録日時</th>
                    <th className="px-5 py-4">詳細</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((user) => (
                    <tr key={user.clerk_user_id} className="hover:bg-white/5">
                      <td className="px-5 py-4">
                        <p className="font-bold text-white">{user.display_name || "No Name"}</p>
                        <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{user.clerk_user_id}</p>
                      </td>
                      <td className="px-5 py-4 font-bold text-yellow-200">{user.plan || "free"}</td>
                      <td className="px-5 py-4 text-slate-300">{user.subscription_status || "-"}</td>
                      <td className="px-5 py-4 text-slate-300">{user.role || "user"}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-400">{formatDate(user.created_at)}</td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/users/${encodeURIComponent(user.clerk_user_id)}`}
                          className="inline-flex rounded-full border border-violet-300/30 bg-violet-400/10 px-4 py-2 text-xs font-black text-violet-200 hover:bg-violet-400/20"
                        >
                          詳細を見る
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && <p className="p-8 text-center text-slate-400">登録ユーザーはいません。</p>}
          </div>
        )}
      </div>
    </main>
  );
}
