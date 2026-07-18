import { auth, currentUser } from "@clerk/nextjs/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";

export type ProStatus = {
  isLoggedIn: boolean;
  isPro: boolean;
  userId: string | null;
  status: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const OWNER_EMAILS = new Set(["kessan.tantei@gmail.com"]);

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const values = subscription.items.data
    .map(
      (item) =>
        (item as Stripe.SubscriptionItem & { current_period_end?: number })
          .current_period_end
    )
    .filter((value): value is number => typeof value === "number");

  return values.length > 0 ? Math.max(...values) : null;
}

export async function getProStatus(): Promise<ProStatus> {
  const { userId } = await auth();

  if (!userId) {
    return {
      isLoggedIn: false,
      isPro: false,
      userId: null,
      status: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    };
  }

  const user = await currentUser();
  const emails =
    user?.emailAddresses?.map((item) => item.emailAddress.toLowerCase()) ?? [];
  const isOwner = emails.some((email) => OWNER_EMAILS.has(email));

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("subscription_status, stripe_customer_id, stripe_subscription_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  let status = data?.subscription_status ?? null;
  let cancelAtPeriodEnd = false;
  let currentPeriodEnd: number | null = null;

  if (data?.stripe_subscription_id) {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        data.stripe_subscription_id
      );
      status = subscription.status;
      cancelAtPeriodEnd = subscription.cancel_at_period_end;
      currentPeriodEnd = subscriptionPeriodEnd(subscription);
    } catch {
      // Stripeの一時的な取得失敗時は、Supabaseに保存済みの状態を使う。
    }
  }

  const hasActiveSubscription = status ? ACTIVE_STATUSES.has(status) : false;

  return {
    isLoggedIn: true,
    isPro: isOwner || hasActiveSubscription,
    userId,
    status: isOwner && !status ? "owner" : status,
    stripeCustomerId: data?.stripe_customer_id ?? null,
    stripeSubscriptionId: data?.stripe_subscription_id ?? null,
    cancelAtPeriodEnd,
    currentPeriodEnd,
  };
}

export function isActiveProStatus(status: string | null | undefined) {
  return status === "owner" || (status ? ACTIVE_STATUSES.has(status) : false);
}
