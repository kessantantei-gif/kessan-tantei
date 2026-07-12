import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { loadRuntimeCompanyMasterEntries } from "@/lib/company-master-runtime";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const isAdmin = await isAdminUser();

  if (!isAdmin) {
    redirect("/");
  }

  const [{ data: profiles }, { data: reportedComments }, companyMaster] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("clerk_user_id, display_name, plan, subscription_status, role, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("company_comment_reactions")
      .select("comment_id, reaction_type")
      .eq("reaction_type", "report")
      .limit(100),
    loadRuntimeCompanyMasterEntries(),
  ]);

  const proUsers = (profiles ?? []).filter(
    (profile) => profile.plan === "pro" && profile.subscription_status === "active"
  ).length;
  const reviewedCompanies = companyMaster.filter((entry) => entry.reviewed).length;
  const automaticCompanies = companyMaster.length - reviewedCompanies;
  const unclassifiedCompanies = companyMaster.filter(
    (entry) => entry.themeId === "other" || entry.theme === "その他"
  ).length;

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.3em] text-green-300">OPERATIONS</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">決算探偵 Admin</h1>
            <p className="mt-3 text-slate-400">運営状況と対応が必要な項目を確認します。</p>
          </div>
          <Link href="/" className="w-fit text-sm font-bold text-slate-400 hover:text-white">
            ← サイトへ戻る
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["登録ユーザー", profiles?.length ?? 0, "text-white"],
            ["Pro会員", proUsers, "text-yellow-200"],
            ["コメント通報", reportedComments?.length ?? 0, "text-red-200"],
            ["管理権限", "Admin", "text-green-300"],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm text-slate-400">{label}</p>
              <p className={`mt-2 text-4xl font-black ${tone}`}>{value}</p>
            </div>
          ))}
        </div>

        <section className="mt-8 rounded-3xl border border-green-400/20 bg-green-500/10 p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.25em] text-green-300">COMPANY MASTER</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">会社分類と比較候補を管理</h2>
              <p className="mt-3 max-w-3xl leading-7 text-slate-300">
                全{companyMaster.length}社のテーマ、サブテーマ、ビジネスモデル、ライバル会社を確認・編集できます。保存した内容は会社比較に反映されます。
              </p>
            </div>
            <Link
              href="/admin/company-master"
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-green-400 px-6 py-3 font-black text-slate-950 hover:bg-green-300"
            >
              会社マスタを開く →
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-slate-400">監修済み</p>
              <p className="mt-2 text-3xl font-black text-green-200">{reviewedCompanies}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-slate-400">自動分類</p>
              <p className="mt-2 text-3xl font-black text-yellow-200">{automaticCompanies}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-slate-400">未分類・要確認</p>
              <p className="mt-2 text-3xl font-black text-red-200">{unclassifiedCompanies}</p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          {[
            ["AI分析管理", "分析の再生成、確認、公開管理はPhase9-2で追加します。"],
            ["データ更新管理", "EDINET取得状況、欠損、再取得機能はPhase9-2で追加します。"],
            ["売上・会員管理", "売上、解約、決済エラーの管理はPhase9-3で追加します。"],
          ].map(([title, description]) => (
            <div key={title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-black">{title}</p>
              <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>
              <span className="mt-5 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-500">
                準備中
              </span>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-black">最近のユーザー</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {(profiles ?? []).slice(0, 10).map((profile) => (
              <div
                key={profile.clerk_user_id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <p className="font-bold text-green-300">{profile.display_name || "No Name"}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{profile.clerk_user_id}</p>
                <p className="mt-2 text-sm text-slate-300">
                  plan: {profile.plan} / status: {profile.subscription_status} / role: {profile.role}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
