import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { loadRuntimeCompanyMasterEntries } from "@/lib/company-master-runtime";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminUser())) redirect("/");

  const [
    { data: profiles },
    { data: reportedComments },
    { data: companies },
    { data: news },
    companyMaster,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "clerk_user_id, display_name, plan, subscription_status, role, stripe_customer_id, stripe_subscription_id, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("company_comment_reactions")
      .select("comment_id, reaction_type")
      .eq("reaction_type", "report")
      .limit(100),
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, score, danger_score, financials, history, risk, risk_level")
      .neq("risk_level", "EXCLUDED")
      .limit(1000),
    supabaseAdmin.from("growth_news").select("id, title, url").limit(100),
    loadRuntimeCompanyMasterEntries(),
  ]);

  const profileRows = profiles ?? [];
  const proUsers = profileRows.filter(
    (profile) =>
      profile.plan === "pro" &&
      ["active", "trialing"].includes(profile.subscription_status ?? "")
  ).length;
  const billingIssues = profileRows.filter((profile) => {
    const status = profile.subscription_status ?? "";
    return (
      ["past_due", "unpaid", "payment_failed", "incomplete"].includes(status) ||
      (profile.plan === "pro" &&
        (!profile.stripe_customer_id || !profile.stripe_subscription_id)) ||
      (profile.plan === "pro" && !["active", "trialing"].includes(status))
    );
  }).length;

  const reviewedCompanies = companyMaster.filter((entry) => entry.reviewed).length;
  const automaticCompanies = companyMaster.length - reviewedCompanies;
  const unclassifiedCompanies = companyMaster.filter(
    (entry) => entry.themeId === "other" || entry.theme === "その他"
  ).length;

  const companyRows = companies ?? [];
  const dataIssues = companyRows.filter((company) => {
    const financials = company.financials ?? {};
    const history = Array.isArray(company.history) ? company.history : [];
    return (
      company.score === null ||
      company.danger_score === null ||
      typeof financials.revenue !== "number" ||
      typeof financials.operatingIncome !== "number" ||
      typeof financials.operatingCF !== "number" ||
      history.length < 2 ||
      !company.risk
    );
  }).length;
  const flashUnavailable = companyRows.filter(
    (company) => !Array.isArray(company.history) || company.history.length < 2
  ).length;
  const brokenNews = (news ?? []).filter(
    (item) => !item.title?.trim() || !item.url?.trim()
  ).length;

  const cards = [
    ["登録ユーザー", profileRows.length, "text-white"],
    ["Pro会員", proUsers, "text-yellow-200"],
    ["課金要対応", billingIssues, "text-red-200"],
    ["コメント通報", reportedComments?.length ?? 0, "text-red-200"],
  ];

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.3em] text-green-300">OPERATIONS</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">決算探偵 Admin</h1>
            <p className="mt-3 text-slate-400">運営状況と対応が必要な項目を確認します。</p>
          </div>
          <Link href="/" className="w-fit text-sm font-bold text-slate-400 hover:text-white">
            ← サイトへ戻る
          </Link>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm text-slate-400">{label}</p>
              <p className={`mt-2 text-4xl font-black ${tone}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <Link
            href="/admin/company-master"
            className="rounded-3xl border border-green-400/20 bg-green-500/10 p-6 transition hover:-translate-y-0.5 hover:border-green-300/40"
          >
            <p className="text-xs font-black tracking-[0.24em] text-green-300">COMPANY MASTER</p>
            <h2 className="mt-2 text-2xl font-black">会社分類・比較候補</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              テーマ、サブテーマ、ビジネスモデル、ライバル会社を編集します。
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
              <span className="rounded-xl bg-black/20 p-3">監修 {reviewedCompanies}</span>
              <span className="rounded-xl bg-black/20 p-3">自動 {automaticCompanies}</span>
              <span className="rounded-xl bg-black/20 p-3">要確認 {unclassifiedCompanies}</span>
            </div>
          </Link>

          <Link
            href="/admin/operations"
            className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-6 transition hover:-translate-y-0.5 hover:border-cyan-300/40"
          >
            <p className="text-xs font-black tracking-[0.24em] text-cyan-300">AI / DATA / CONTENT</p>
            <h2 className="mt-2 text-2xl font-black">分析・データ運用</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              AI分析、財務欠損、決算速報、ニュース不備を確認します。
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
              <span className="rounded-xl bg-black/20 p-3">欠損 {dataIssues}</span>
              <span className="rounded-xl bg-black/20 p-3">速報不足 {flashUnavailable}</span>
              <span className="rounded-xl bg-black/20 p-3">ニュース {brokenNews}</span>
            </div>
          </Link>

          <Link
            href="/admin/billing"
            className="rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-6 transition hover:-translate-y-0.5 hover:border-yellow-300/40"
          >
            <p className="text-xs font-black tracking-[0.24em] text-yellow-300">BILLING</p>
            <h2 className="mt-2 text-2xl font-black">売上・会員管理</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Stripe契約、月額換算売上、解約予定、決済エラー、会員状態の不整合を確認します。
            </p>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-black/20 p-4">
              <span className="text-sm text-slate-400">要対応</span>
              <span className="text-2xl font-black text-red-200">{billingIssues}</span>
            </div>
          </Link>
        </section>

        <section className="mt-8 rounded-3xl border border-green-400/20 bg-green-500/10 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.24em] text-green-300">PHASE 9</p>
              <h2 className="mt-2 text-2xl font-black">運営管理基盤 完成</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                会社分類、AI・データ・コンテンツ、売上・会員状態を管理画面から確認できます。
              </p>
            </div>
            <span className="w-fit rounded-full bg-green-400 px-4 py-2 text-sm font-black text-slate-950">COMPLETE</span>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-black">最近のユーザー</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {profileRows.slice(0, 10).map((profile) => (
              <div key={profile.clerk_user_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
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
