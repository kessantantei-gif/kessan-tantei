import Link from "next/link";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { isAdminUser } from "@/lib/admin-engine";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Profile = {
  clerk_user_id: string;
  display_name: string | null;
  plan: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type StripeSnapshot = {
  subscriptions: Stripe.Subscription[];
  invoices: Stripe.Invoice[];
  error: string | null;
};

function yen(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: number | string | null | undefined) {
  if (!value) return "—";
  const parsed = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthlyAmount(subscription: Stripe.Subscription) {
  return subscription.items.data.reduce((sum, item) => {
    const unitAmount = item.price.unit_amount ?? 0;
    const quantity = item.quantity ?? 1;
    const recurring = item.price.recurring;
    if (!recurring) return sum;
    const amount = unitAmount * quantity;
    if (recurring.interval === "year") return sum + amount / 12;
    if (recurring.interval === "week") return sum + (amount * 52) / 12;
    if (recurring.interval === "day") return sum + (amount * 365) / 12;
    return sum + amount;
  }, 0);
}

function periodEnd(subscription: Stripe.Subscription) {
  const values = subscription.items.data
    .map((item) => (item as Stripe.SubscriptionItem & { current_period_end?: number }).current_period_end)
    .filter((value): value is number => typeof value === "number");
  return values.length > 0 ? Math.max(...values) : null;
}

function customerId(subscription: Stripe.Subscription) {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

async function loadStripeSnapshot(): Promise<StripeSnapshot> {
  try {
    const stripe = getStripe();
    const [subscriptions, invoices] = await Promise.all([
      stripe.subscriptions.list({ status: "all", limit: 100 }),
      stripe.invoices.list({ limit: 100 }),
    ]);
    return {
      subscriptions: subscriptions.data,
      invoices: invoices.data,
      error: null,
    };
  } catch (error) {
    return {
      subscriptions: [],
      invoices: [],
      error: error instanceof Error ? error.message : "Stripe情報の取得に失敗しました。",
    };
  }
}

function statusTone(status: string | null | undefined) {
  if (status === "active" || status === "trialing" || status === "paid") return "text-green-200";
  if (status === "past_due" || status === "unpaid" || status === "payment_failed") return "text-red-200";
  if (status === "canceled" || status === "cancelled" || status === "void") return "text-slate-400";
  return "text-yellow-200";
}

export default async function AdminBillingPage() {
  if (!(await isAdminUser())) redirect("/");

  const [{ data: profileData }, stripeSnapshot] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "clerk_user_id, display_name, plan, subscription_status, stripe_customer_id, stripe_subscription_id, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(500),
    loadStripeSnapshot(),
  ]);

  const profiles = (profileData ?? []) as Profile[];
  const subscriptions = stripeSnapshot.subscriptions;
  const invoices = stripeSnapshot.invoices;
  const activeSubscriptions = subscriptions.filter((item) =>
    ["active", "trialing"].includes(item.status)
  );
  const cancelScheduled = activeSubscriptions.filter((item) => item.cancel_at_period_end);
  const paymentIssueSubscriptions = subscriptions.filter((item) =>
    ["past_due", "unpaid", "incomplete"].includes(item.status)
  );
  const failedInvoices = invoices.filter(
    (invoice) => invoice.status === "open" && (invoice.amount_due ?? 0) > 0
  );
  const monthlyRecurringRevenue = activeSubscriptions.reduce(
    (sum, subscription) => sum + monthlyAmount(subscription),
    0
  );

  const subscriptionById = new Map(subscriptions.map((item) => [item.id, item]));
  const subscriptionByCustomer = new Map(
    subscriptions.map((item) => [customerId(item), item])
  );

  const profileIssues = profiles.flatMap((profile) => {
    const issues: string[] = [];
    const stripeSubscription = profile.stripe_subscription_id
      ? subscriptionById.get(profile.stripe_subscription_id)
      : profile.stripe_customer_id
        ? subscriptionByCustomer.get(profile.stripe_customer_id)
        : undefined;

    if (profile.plan === "pro" && !profile.stripe_customer_id) {
      issues.push("Pro会員ですがStripe顧客IDがありません");
    }
    if (profile.plan === "pro" && !profile.stripe_subscription_id) {
      issues.push("Pro会員ですがStripe契約IDがありません");
    }
    if (profile.plan === "pro" && profile.subscription_status && !["active", "trialing"].includes(profile.subscription_status)) {
      issues.push(`Pro判定と契約状態が不一致: ${profile.subscription_status}`);
    }
    if (stripeSubscription && profile.subscription_status !== stripeSubscription.status) {
      issues.push(
        `Supabase(${profile.subscription_status ?? "未設定"}) / Stripe(${stripeSubscription.status}) が不一致`
      );
    }
    if (profile.stripe_subscription_id && !stripeSubscription && !stripeSnapshot.error) {
      issues.push("登録されたStripe契約を取得できません");
    }

    return issues.length > 0 ? [{ profile, issues }] : [];
  });

  const recentInvoices = [...invoices]
    .sort((a, b) => b.created - a.created)
    .slice(0, 20);

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.3em] text-yellow-300">BILLING OPERATIONS</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">売上・会員管理</h1>
            <p className="mt-3 text-slate-400">Stripeと会員プロフィールを照合し、課金異常と解約予定を確認します。</p>
          </div>
          <div className="flex gap-4 text-sm font-bold">
            <Link href="/admin" className="text-slate-400 hover:text-white">← Admin</Link>
            <Link href="/" className="text-slate-400 hover:text-white">サイトへ</Link>
          </div>
        </header>

        {stripeSnapshot.error ? (
          <section className="mt-8 rounded-3xl border border-red-400/30 bg-red-500/10 p-6">
            <h2 className="font-black text-red-200">Stripe情報を取得できませんでした</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">{stripeSnapshot.error}</p>
            <p className="mt-2 text-xs text-slate-500">Supabaseに保存されている会員情報は引き続き表示できます。</p>
          </section>
        ) : null}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["登録ユーザー", profiles.length, "text-white"],
            ["有効契約", activeSubscriptions.length, "text-green-200"],
            ["月額換算売上", yen(monthlyRecurringRevenue), "text-yellow-200"],
            ["解約予定", cancelScheduled.length, "text-yellow-200"],
            ["要対応", profileIssues.length + paymentIssueSubscriptions.length, "text-red-200"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-slate-400">{label}</p>
              <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-3xl border border-red-400/20 bg-red-500/5 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.25em] text-red-300">ACTION REQUIRED</p>
              <h2 className="mt-2 text-2xl font-black">課金・会員状態の要対応</h2>
            </div>
            <p className="text-sm text-slate-400">{profileIssues.length}ユーザー</p>
          </div>
          <div className="mt-5 space-y-3">
            {profileIssues.length === 0 ? (
              <p className="rounded-2xl border border-green-400/20 bg-green-500/10 p-4 text-green-200">プロフィールとStripe契約の不整合は検出されませんでした。</p>
            ) : (
              profileIssues.map(({ profile, issues }) => (
                <article key={profile.clerk_user_id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{profile.display_name || "No Name"}</p>
                      <p className="mt-1 text-xs text-slate-500">{profile.clerk_user_id}</p>
                    </div>
                    <p className="text-xs text-slate-500">更新: {date(profile.updated_at)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {issues.map((issue) => (
                      <span key={issue} className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-100">{issue}</span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-yellow-400/20 bg-yellow-500/5 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.25em] text-yellow-300">SUBSCRIPTIONS</p>
              <h2 className="mt-2 text-2xl font-black">Stripe契約一覧</h2>
            </div>
            <p className="text-sm text-slate-400">最大100件</p>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {subscriptions.length === 0 ? (
              <p className="text-slate-400">表示できる契約はありません。</p>
            ) : subscriptions.map((subscription) => (
              <article key={subscription.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black">{yen(monthlyAmount(subscription))} / 月換算</p>
                  <span className={`text-sm font-black ${statusTone(subscription.status)}`}>{subscription.status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{subscription.id}</p>
                <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  <p>次回更新: {date(periodEnd(subscription))}</p>
                  <p>解約予定: {subscription.cancel_at_period_end ? "あり" : "なし"}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.25em] text-cyan-300">INVOICES</p>
              <h2 className="mt-2 text-2xl font-black">最近の請求</h2>
            </div>
            <p className="text-sm text-slate-400">未払い候補 {failedInvoices.length}件</p>
          </div>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/10 text-slate-300">
                <tr>
                  <th className="p-4">作成日時</th>
                  <th className="p-4">状態</th>
                  <th className="p-4">請求額</th>
                  <th className="p-4">支払済み</th>
                  <th className="p-4">請求ID</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-white/10 text-slate-300">
                    <td className="p-4">{date(invoice.created)}</td>
                    <td className={`p-4 font-black ${statusTone(invoice.status)}`}>{invoice.status ?? "—"}</td>
                    <td className="p-4">{yen(invoice.amount_due ?? 0)}</td>
                    <td className="p-4">{yen(invoice.amount_paid ?? 0)}</td>
                    <td className="p-4 text-xs text-slate-500">{invoice.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
