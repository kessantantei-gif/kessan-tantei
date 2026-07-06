"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

export async function createBillingPortalSession() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    redirect("/pricing");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp";
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/profile`,
  });

  redirect(session.url);
}
