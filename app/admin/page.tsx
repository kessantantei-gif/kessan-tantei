import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

export default async function AdminPage() {
  const isAdmin = await isAdminUser();

  if (!isAdmin) {
    redirect("/");
  }

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("clerk_user_id, display_name, plan, subscription_status, role, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: reportedComments } = await supabaseAdmin
    .from("company_comment_reactions")
    .select("comment_id, reaction_type")
    .eq("reaction_type", "report")
    .limit(100);

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black">
            決算探偵 Admin
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            ← サイトへ戻る
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-slate-400">Users</p>
            <p className="mt-2 text-4xl font-black">{profiles?.length ?? 0}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-slate-400">Reports</p>
            <p className="mt-2 text-4xl font-black">
              {reportedComments?.length ?? 0}
            </p>
          </div>

          <div className="rounded-3xl border border-green-400/20 bg-green-500/10 p-6">
            <p className="text-sm text-slate-400">Role</p>
            <p className="mt-2 text-4xl font-black text-green-300">Admin</p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-black">ユーザー一覧</h2>

          <div className="mt-5 space-y-3">
            {(profiles ?? []).map((profile) => (
              <div
                key={profile.clerk_user_id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <p className="font-bold text-green-300">
                  {profile.display_name || "No Name"}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {profile.clerk_user_id}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  plan: {profile.plan} / status: {profile.subscription_status} /
                  role: {profile.role}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}