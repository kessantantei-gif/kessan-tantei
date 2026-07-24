import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { loadRuntimeCompanyMasterEntries } from "@/lib/company-master-runtime";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AllMarketCompany = {
  ticker: string;
  market_segment: string;
  listing_status: string;
  edinet_code: string | null;
};

export default async function AdminPage() {
  if (!(await isAdminUser())) redirect("/");

  const [
    { data: profiles },
    { data: reportedComments },
    { data: companies },
    { data: news },
    { data: allMarketCompanies },
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
      .limit(10000),
    supabaseAdmin.from("growth_news").select("id, title, url").limit(300),
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker, market_segment, listing_status, edinet_code")
      .eq("listing_status", "listed")
      .limit(10000),
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

  const listedRows = (allMarketCompanies ?? []) as AllMarketCompany[];
  const companyRows = companies ?? [];
  const analyzedTickers = new Set(companyRows.map((company) => company.ticker));
  const analyzedListed = listedRows.filter((company) => analyzedTickers.has(company.ticker)).length;
  const unanalyzedListed = Math.max(0, listedRows.length - analyzedListed);
  const analysisCoverage =
    listedRows.length > 0 ? Math.round((analyzedListed / listedRows.length) * 100) : 0;
  const edinetLinked = listedRows.filter((company) => company.edinet_code).length;

  const reviewedCompanies = companyMaster.filter((entry) => entry.reviewed).length;
  const automaticCompanies = companyMaster.length - reviewedCompanies;
  const unclassifiedCompanies = companyMaster.filter(
    (entry) => entry.themeId === "other" || entry.theme === "その他"
  ).length;
  const classifiedCompanies = companyMaster.length - unclassifiedCompanies;

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

  const userCards = [
    ["登録ユーザー", profileRows.length, "text-white"],
    ["Pro会員", proUsers, "text-yellow-200"],
    ["課金要対応", billingIssues, "text-red-200"],
    ["コメント通報", reportedComments?.length ?? 0, "text-red-200"],
  ];

  const dataCards = [
    ["全市場上場会社", listedRows.length, "text-white"],
    ["解析済み", analyzedListed, "text-green-200"],
    ["未解析", unanalyzedListed, "text-red-200"],
    ["分類済み", classifiedCompanies, "text-cyan-200"],
  ];

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.3em] text-green-300">OPERATIONS</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">決算探偵 Admin</h1>
            <p className="mt-3 text-slate-400">
              全市場の会社数、解析、分類、EDINET連携を実数で確認します。
            </p>
          </div>
          <Link href="/" className="w-fit text-sm font-bold text-slate-400 hover:text-white">
            ← サイトへ戻る
          </Link>
        </header>

        <section>
          <h2 className="text-lg font-black">全市場データ進捗</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dataCards.map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm text-slate-400">{label}</p>
                <p className={`mt-2 text-4xl font-black ${tone}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-slate-400">解析進捗</p>
              <p className="mt-2 text-2xl font-black">{analysisCoverage}%</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-slate-400">EDINET紐付け</p>
              <p className="mt-2 text-2xl font-black">{edinetLinked} / {listedRows.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-slate-400">分類要確認</p>
              <p className="mt-2 text-2xl font-black text-yellow-200">{unclassifiedCompanies}</p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-black">ユーザー・課金</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {userCards.map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm text-slate-400">{label}</p>
                <p className={`mt-2 text-4xl font-black ${tone}`}>{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/all-markets"
            className="rounded-3xl border border-violet-400/20 bg-violet-500/10 p-6 transition hover:-translate-y-0.5 hover:border-violet-300/40"
          >
            <p className="text-xs font-black tracking-[0.24em] text-violet-300">ALL MARKETS</p>
            <h2 className="mt-2 text-2xl font-black">全市場進捗</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              市場別の上場数、解析率、EDINET紐付け、インポート失敗を確認します。
            </p>
            <div className="mt-5 rounded-2xl bg-black/20 p-4 text-sm">
              解析 {analyzedListed} / {listedRows.length}社
            </div>
          </Link>

          <Link
            href="/admin/company-master"
            className="rounded-3xl border border-green-400/20 bg-green-500/10 p-6 transition hover:-translate-y-0.5 hover:border-green-300/40"
          >
            <p className="text-xs font-black tracking-[0.24em] text-green-300">COMPANY MASTER</p>
            <h2 className="mt-2 text-2xl font-black">会社分類・比較候補</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              全市場のテーマ、業種、ビジネスモデル、ライバル会社を監修します。
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
              未解析会社、財務欠損、決算速報、ニュース不備を全市場で確認します。
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
              <span className="rounded-xl bg-black/20 p-3">未解析 {unanalyzedListed}</span>
              <span className="rounded-xl bg-black/20 p-3">欠損 {dataIssues}</span>
              <span className="rounded-xl bg-black/20 p-3">速報不足 {flashUnavailable}</span>
            </div>
          </Link>

          <Link
            href="/admin/billing"
            className="rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-6 transition hover:-translate-y-0.5 hover:border-yellow-300/40"
          >
            <p className="text-xs font-black tracking-[0.24em] text-yellow-300">BILLING</p>
            <h2 className="mt-2 text-2xl font-black">売上・会員管理</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Stripe契約、月額換算売上、解約予定、決済エラーを確認します。
            </p>
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-black/20 p-4">
              <span className="text-sm text-slate-400">要対応</span>
              <span className="text-2xl font-black text-red-200">{billingIssues}</span>
            </div>
          </Link>
        </section>

        <section className={`mt-8 rounded-3xl border p-6 sm:p-8 ${analysisCoverage >= 90 && unclassifiedCompanies === 0 ? "border-green-400/20 bg-green-500/10" : "border-yellow-400/20 bg-yellow-500/10"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-xs font-black tracking-[0.24em] ${analysisCoverage >= 90 && unclassifiedCompanies === 0 ? "text-green-300" : "text-yellow-300"}`}>
                DATA PIPELINE STATUS
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {analysisCoverage >= 90 && unclassifiedCompanies === 0
                  ? "全市場データ基盤は公開基準を満たしています"
                  : "全市場データ投入は進行中です"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                未解析 {unanalyzedListed}社、分類要確認 {unclassifiedCompanies}社、ニュース不備 {brokenNews}件です。
              </p>
            </div>
            <span className={`w-fit rounded-full px-4 py-2 text-sm font-black ${analysisCoverage >= 90 && unclassifiedCompanies === 0 ? "bg-green-400 text-slate-950" : "bg-yellow-300 text-slate-950"}`}>
              {analysisCoverage >= 90 && unclassifiedCompanies === 0 ? "READY" : "IN PROGRESS"}
            </span>
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
