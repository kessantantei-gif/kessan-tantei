"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function value(cookieStore: Awaited<ReturnType<typeof cookies>>, name: string) {
  return cookieStore.get(name)?.value?.slice(0, 180) || "";
}

async function hasActiveStripeSubscription(customerId: string) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });

  return subscriptions.data.some((subscription) =>
    ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
  );
}

export async function createCheckoutSession() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp";

  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  const couponId = process.env.STRIPE_LAUNCH_COUPON_ID;

  if (!priceId) {
    throw new Error("STRIPE_PRO_PRICE_ID が設定されていません");
  }

  if (!couponId) {
    throw new Error("STRIPE_LAUNCH_COUPON_ID が設定されていません");
  }

  const cookieStore = await cookies();
  const acquisition = {
    utm_source: value(cookieStore, "kt_utm_source"),
    utm_medium: value(cookieStore, "kt_utm_medium"),
    utm_campaign: value(cookieStore, "kt_utm_campaign"),
    utm_content: value(cookieStore, "kt_utm_content"),
    referrer: value(cookieStore, "kt_referrer"),
  };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id, subscription_status")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (
    profile?.subscription_status &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(profile.subscription_status)
  ) {
    redirect("/profile?subscription=already-active");
  }

  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { clerk_user_id: userId },
    });

    customerId = customer.id;

    await supabaseAdmin.from("profiles").upsert(
      {
        clerk_user_id: userId,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id" }
    );
  } else if (await hasActiveStripeSubscription(customerId)) {
    redirect("/profile?subscription=already-active");
  }

  await supabaseAdmin.from("acquisition_events").insert({
    event_name: "checkout_start",
    path: "/pricing",
    clerk_user_id: userId,
    utm_source: acquisition.utm_source || null,
    utm_medium: acquisition.utm_medium || null,
    utm_campaign: acquisition.utm_campaign || null,
    utm_content: acquisition.utm_content || null,
    referrer: acquisition.referrer || null,
  });

  const metadata = {
    clerk_user_id: userId,
    ...acquisition,
  };

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    discounts: [{ coupon: couponId }],
    success_url: `${appUrl}/profile?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancel`,
    metadata,
    subscription_data: { metadata },
  });

  if (!session.url) {
    throw new Error("Stripe Checkout URL を作成できませんでした");
  }

  redirect(session.url);
}
