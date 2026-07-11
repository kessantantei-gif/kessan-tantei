import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

export type ProStatus = {
  isLoggedIn: boolean;
  isPro: boolean;
  userId: string | null;
  status: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const OWNER_EMAILS = new Set(["kessan.tantei@gmail.com"]);

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
    };
  }

  const user = await currentUser();
  const emails = user?.emailAddresses?.map((item) => item.emailAddress.toLowerCase()) ?? [];
  const isOwner = emails.some((email) => OWNER_EMAILS.has(email));

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("subscription_status, stripe_customer_id, stripe_subscription_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const status = data?.subscription_status ?? null;
  const hasActiveSubscription = status ? ACTIVE_STATUSES.has(status) : false;

  return {
    isLoggedIn: true,
    isPro: isOwner || hasActiveSubscription,
    userId,
    status: isOwner && !status ? "owner" : status,
    stripeCustomerId: data?.stripe_customer_id ?? null,
    stripeSubscriptionId: data?.stripe_subscription_id ?? null,
  };
}

export function isActiveProStatus(status: string | null | undefined) {
  return status === "owner" || (status ? ACTIVE_STATUSES.has(status) : false);
}
