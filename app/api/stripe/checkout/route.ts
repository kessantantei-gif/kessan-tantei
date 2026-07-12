import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

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

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp";

  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  const couponId = process.env.STRIPE_LAUNCH_COUPON_ID;

  if (!priceId) {
    return NextResponse.json({ error: "STRIPE_PRO_PRICE_ID missing" }, { status: 500 });
  }

  if (!couponId) {
    return NextResponse.json({ error: "STRIPE_LAUNCH_COUPON_ID missing" }, { status: 500 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id, subscription_status")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (
    profile?.subscription_status &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(profile.subscription_status)
  ) {
    return NextResponse.json(
      { error: "すでにProプランを契約しています", redirect: "/profile" },
      { status: 409 }
    );
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
    return NextResponse.json(
      { error: "すでにProプランを契約しています", redirect: "/profile" },
      { status: 409 }
    );
  }

  const metadata = { clerk_user_id: userId };

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

  return NextResponse.json({ url: session.url });
}
