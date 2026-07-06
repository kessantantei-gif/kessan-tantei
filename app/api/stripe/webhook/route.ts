import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type ProfileUpdate = {
  clerk_user_id?: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  plan?: "free" | "pro";
  updated_at: string;
};

type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

function isProStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

function customerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function subscriptionId(value: string | Stripe.Subscription | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function upsertProfile(update: ProfileUpdate) {
  if (update.clerk_user_id) {
    await supabaseAdmin.from("profiles").upsert(update, { onConflict: "clerk_user_id" });
    return;
  }

  if (update.stripe_customer_id) {
    await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("stripe_customer_id", update.stripe_customer_id);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const clerkUserId = session.metadata?.clerk_user_id;
  const stripeCustomerId = customerId(session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
  const currentSubscriptionId = subscriptionId(session.subscription as string | Stripe.Subscription | null | undefined);

  let status: string | null = null;
  if (currentSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(currentSubscriptionId);
    status = subscription.status;
  }

  await upsertProfile({
    clerk_user_id: clerkUserId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: currentSubscriptionId,
    subscription_status: status,
    plan: isProStatus(status) ? "pro" : "free",
    updated_at: new Date().toISOString(),
  });
}

async function handleSubscription(subscription: Stripe.Subscription) {
  const stripeCustomerId = customerId(subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
  const clerkUserId = subscription.metadata?.clerk_user_id;
  const status = subscription.status;

  await upsertProfile({
    clerk_user_id: clerkUserId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscription.id,
    subscription_status: status,
    plan: isProStatus(status) ? "pro" : "free",
    updated_at: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "missing stripe webhook configuration" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object as InvoiceWithSubscription;
        const currentSubscriptionId = subscriptionId(invoice.subscription);
        const stripeCustomerId = customerId(invoice.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
        if (currentSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(currentSubscriptionId);
          await handleSubscription(subscription);
        } else if (stripeCustomerId) {
          await upsertProfile({
            stripe_customer_id: stripeCustomerId,
            subscription_status: "payment_failed",
            plan: "free",
            updated_at: new Date().toISOString(),
          });
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
