import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

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
    .select("stripe_customer_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { clerk_user_id: userId },
    });

    customerId = customer.id;

    await supabaseAdmin.from("profiles").upsert({
      clerk_user_id: userId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    discounts: [{ coupon: couponId }],
    success_url: `${appUrl}/profile?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancel`,
    metadata: { clerk_user_id: userId },
  });

  return NextResponse.json({ url: session.url });
}