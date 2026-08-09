import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RecentProfile = {
  clerk_user_id: string;
  display_name: string | null;
  plan: string | null;
  subscription_status: string | null;
  role: string | null;
};

function n(value: number | null | undefined) {
  return value ?? 0;
}

export default async function AdminPage() {
  if (!(await isAdminUser())) redirect("/");

  // Keep the admin landing page intentionally lightweight. Detailed JSON-heavy
  // diagnostics belong on the dedicated admin sub-pages, not on every /admin load.
  const [
    profilesResult,
    proResult,
    billingResult,
    reportsResult,
    listedResult,
    analyzedResult,
    edinetResult,
    curatedResult,
    reviewedResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "clerk_user_id, display_name, plan, subscription_status, role",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("profiles")
      .select("clerk_user_id", { count: "exact", head: true })
      .eq("plan", "pro")
      .in("subscription_status", ["active", "trialing"]),
    supabaseAdmin
      .from("profiles")
      .select("clerk_user_id", { count: "exact", head: true })
      .in("subscription_status", [
        "past_due",
        "unpaid",
        "payment_failed",
        "incomplete",
      ]),
    supabaseAdmin
      .from("company_comment_reactions")
      .select("comment_id", { count: "exact", head: true })
      .eq("reaction_type", "report"),
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker", { count: "exact", head: true })
      .eq("listing_status", "listed"),
    supabaseAdmin
      .from("company_analyses")
      .select("ticker", { count: "exact", head: true })
      .neq("risk_level", "EXCLUDED"),
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker", { count: "exact", head: true })
      .eq("listing_status", "listed")
      .not("edinet_code", "is", null),
    supabaseAdmin
      .from("company_master")
      .select("ticker", { count: "exact", head: true }),
    supabaseAdmin
      .from("company_master")
      .select("ticker", { count: "exact", head: true })
      .eq("reviewed", true),
  ]);

  const recentProfiles = (profilesResult.data ?? []) as RecentProfile[];
  const registeredUsers = n(profilesResult.count);
  const proUsers = n(proResult.count);
  const billingIssues = n(billingResult.count);
  const reportedComments = n(reportsResult.count);
  const listedCompanies = n(listedResult.count);
  const analyzedCompanies = Math.min(n(analyzedResult.count), listedCompanies);
  const unanalyzedCompanies = Math.max(0, listedCompanies - analyzedCompanies);
  const edinetLinked = n(edinetResult.count);
  const curatedCompanies = n(curatedResult.count);
  const reviewedCompanies = n(reviewedResult.count);
  const analysisCoverage =
    listedCompanies > 0
      ? Math.round((analyzedCompanies / listedCompanies) * 100)
      : 0;

  const queryErrors = [
    profilesResult.error,
    proResult.error,
    billingResult.error,
    reportsResult.error,
    listedResult.error,
    analyzedResult.error,
    edinetResult.error,
    curatedResult.error,
    reviewedResult.error,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    console.error(
      "admin dashboard aggregate query failed",
      queryErrors.map((error) => error?.message)
    );
  }

  const dataCards = [
    ["全市場上場会社", listedCompanies, "text-white"],
    ["解析済み", analyzedCompanies, "text-green-200"],
    ["未解析", unanalyzedCompanies, "text-red-200"],
    ["会社マスタ監修", reviewedCompanies, "text-cyan-200"],
  ] as const;

  const userCards = [
    ["登録ユーザー", registeredUsers, "text-white"],
    ["Pro会員", proUsers, "text-yellow-200"],
    ["決済要確認", billingIssues, "text-red-200"],
    ["コメント通報", reportedComments, "text-red-200"],
  ] as const;

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.3em] text-green-300">
              OPERATIONS
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">
              決算探偵 Admin
            </h1>
            <p className="mt-3 text-slate-400">
              全市場の会社数、解析、分類、EDINET連携を軽量集計で確認します。
            </p>
          </div>
          <Link
            href="/"
            className="w-fit text-sm font-bold text-slate-400 hover:text-white"
          >
            ← サイトへ戻る
          </Link>
        </header>

        {queryErrors.length > 0 ? (
          <div className="mb-6 rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">
            一部の管理集計を取得できませんでした。各詳細画面は引き続き利用できます。
          </div>
        ) : null}

        <section>
          <h2 className="text-lg font-black">全市場データ進捗</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dataCards.map(([label, value, tone]) => (
              <div
                key={label}
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
              >
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
              <p className="mt-2 text-2xl font-black">
                {edinetLinked} / {listedCompanies}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-slate-400">個別監修済み</p>
              <p className="mt-2 text-2xl font-black text-cyan-200">
                {reviewedCompanies} / {curatedCompanies}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-black">ユーザー・課金</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {userCards.map(([label, value, tone]) => (
              <div
                key={label}
                className="rounded-3xl border border-white/10 bg-white/5 p-6"
              >
                <p className="text-sm text-slate-400">{label}</p>
                <p className={`mt-2 text-4xl font-black ${tone}`}>{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <AdminLink
            href="/admin/all-markets"
            eyebrow="ALL MARKETS"
            title="全市場進捗"
            description="市場別の上場数、解析率、EDINET紐付け、インポート状況を確認します。"
            tone="violet"
          />
          <AdminLink
            href="/admin/company-master"
            eyebrow="COMPANY MASTER"
            title="会社分類・比較候補"
            description="テーマ、業種、ビジネスモデル、ライバル会社を監修します。"
            tone="green"
          />
          <AdminLink
            href="/admin/operations"
            eyebrow="AI / DATA / CONTENT"
            title="分析・データ運用"
            description="財務欠損、決算速報、ニュースなどの詳細診断を確認します。"
            tone="cyan"
          />
          <AdminLink
            href="/admin/billing"
            eyebrow="BILLING"
            title="売上・会員管理"
            description="Stripe契約、売上、解約予定、決済エラーを確認します。"
            tone="yellow"
          />
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black">最近のユーザー</h2>
            <Link
              href="/admin/users"
              className="text-sm font-bold text-cyan-300 hover:text-cyan-200"
            >
              全ユーザー →
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recentProfiles.map((profile) => (
              <div
                key={profile.clerk_user_id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <p className="font-bold text-green-300">
                  {profile.display_name || "No Name"}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {profile.clerk_user_id}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  plan: {profile.plan ?? "free"} / status:{" "}
                  {profile.subscription_status ?? "-"} / role:{" "}
                  {profile.role ?? "user"}
                </p>
              </div>
            ))}
            {recentProfiles.length === 0 ? (
              <p className="text-sm text-slate-400">ユーザー情報はまだありません。</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function AdminLink({
  href,
  eyebrow,
  title,
  description,
  tone,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  tone: "violet" | "green" | "cyan" | "yellow";
}) {
  const tones = {
    violet: "border-violet-400/20 bg-violet-500/10 text-violet-300",
    green: "border-green-400/20 bg-green-500/10 text-green-300",
    cyan: "border-cyan-400/20 bg-cyan-500/10 text-cyan-300",
    yellow: "border-yellow-400/20 bg-yellow-500/10 text-yellow-300",
  } as const;

  return (
    <Link
      href={href}
      className={`rounded-3xl border p-6 transition hover:-translate-y-0.5 ${tones[tone]}`}
    >
      <p className="text-xs font-black tracking-[0.24em]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">{description}</p>
    </Link>
  );
}
