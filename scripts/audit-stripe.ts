import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

type Severity = "ERROR" | "WARNING" | "INFO";

type Item = {
  severity: Severity;
  message: string;
};

const requiredFiles = [
  "lib/stripe.ts",
  "app/pricing/actions.ts",
  "app/api/stripe/webhook/route.ts",
  "app/profile/billing-actions.ts",
  "components/billing-portal-button.tsx",
  "components/pro-status-card.tsx",
  "lib/pro.ts",
];

const webhookEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

function exists(filePath: string) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function env(name: string) {
  return process.env[name];
}

function add(items: Item[], severity: Severity, message: string) {
  items.push({ severity, message });
}

function printGroup(title: string, items: Item[]) {
  console.log(`\n=== ${title} ===`);
  if (items.length === 0) {
    console.log("OK");
    return;
  }
  for (const item of items) console.log(`${item.severity}: ${item.message}`);
}

function auditEnv(items: Item[]) {
  const secretKey = env("STRIPE_SECRET_KEY");
  const priceId = env("STRIPE_PRO_PRICE_ID");
  const webhookSecret = env("STRIPE_WEBHOOK_SECRET");
  const appUrl = env("NEXT_PUBLIC_APP_URL");

  if (!secretKey) add(items, "WARNING", "STRIPE_SECRET_KEY is missing");
  else if (!secretKey.startsWith("sk_live_") && !secretKey.startsWith("sk_test_")) {
    add(items, "ERROR", "STRIPE_SECRET_KEY format looks invalid");
  } else {
    add(items, "INFO", `STRIPE_SECRET_KEY mode: ${secretKey.startsWith("sk_live_") ? "live" : "test"}`);
  }

  if (!priceId) add(items, "WARNING", "STRIPE_PRO_PRICE_ID is missing");
  else if (!priceId.startsWith("price_")) add(items, "ERROR", "STRIPE_PRO_PRICE_ID must start with price_");

  if (!webhookSecret) add(items, "WARNING", "STRIPE_WEBHOOK_SECRET is missing");
  else if (!webhookSecret.startsWith("whsec_")) add(items, "ERROR", "STRIPE_WEBHOOK_SECRET must start with whsec_");

  if (!appUrl) add(items, "WARNING", "NEXT_PUBLIC_APP_URL is missing");
  else if (!appUrl.startsWith("https://")) add(items, "WARNING", "NEXT_PUBLIC_APP_URL should use https:// in production");
}

function requireContent(items: Item[], filePath: string, keywords: string[], message: string) {
  if (!exists(filePath)) {
    add(items, "ERROR", `${filePath} is missing`);
    return;
  }

  const content = read(filePath);
  if (!keywords.every((keyword) => content.includes(keyword))) {
    add(items, "ERROR", message);
  }
}

function auditFiles(items: Item[]) {
  for (const file of requiredFiles) {
    if (!exists(file)) add(items, "ERROR", `${file} is missing`);
  }

  if (exists("app/api/stripe/webhook/route.ts")) {
    const webhook = read("app/api/stripe/webhook/route.ts");
    for (const event of webhookEvents) {
      if (!webhook.includes(event)) add(items, "WARNING", `webhook does not mention ${event}`);
    }
    if (!webhook.includes("constructEvent")) {
      add(items, "ERROR", "webhook signature verification is missing");
    }
    if (!webhook.includes("isProStatus(status) ? \"pro\" : \"free\"")) {
      add(items, "ERROR", "webhook Pro entitlement update is not detected");
    }
  }

  if (exists("app/pricing/actions.ts")) {
    const actions = read("app/pricing/actions.ts");
    if (!actions.includes("checkout.sessions.create")) {
      add(items, "ERROR", "checkout session creation is missing");
    }
    if (!actions.includes("clerk_user_id")) {
      add(items, "WARNING", "checkout metadata clerk_user_id is missing");
    }
    if (!/subscriptions\.list|subscription/.test(actions)) {
      add(items, "ERROR", "duplicate subscription prevention is not detected");
    }
  }

  if (exists("app/profile/billing-actions.ts")) {
    const billing = read("app/profile/billing-actions.ts");
    if (!billing.includes("billingPortal.sessions.create")) {
      add(items, "ERROR", "billing portal session creation is missing");
    }
  }

  requireContent(
    items,
    "components/pro-status-card.tsx",
    ["cancelAtPeriodEnd", "currentPeriodEnd", "解約を受け付けています"],
    "scheduled cancellation status is not shown on the profile"
  );

  requireContent(
    items,
    "lib/pro.ts",
    [
      "stripe.subscriptions.retrieve",
      "cancel_at_period_end",
      "current_period_end",
      "active",
      "trialing",
    ],
    "live subscription cancellation and entitlement handling is not detected"
  );
}

function score(items: Item[]) {
  const errors = items.filter((item) => item.severity === "ERROR").length;
  const warnings = items.filter((item) => item.severity === "WARNING").length;
  return Math.max(0, 100 - errors * 20 - warnings * 5);
}

function main() {
  const items: Item[] = [];
  auditEnv(items);
  auditFiles(items);

  const errors = items.filter((item) => item.severity === "ERROR");
  const warnings = items.filter((item) => item.severity === "WARNING");
  const info = items.filter((item) => item.severity === "INFO");

  console.log("=== stripe audit ===");
  console.log({ score: score(items), errors: errors.length, warnings: warnings.length, info: info.length });
  printGroup("ERRORS", errors);
  printGroup("WARNINGS", warnings);
  printGroup("INFO", info);

  if (errors.length > 0) process.exitCode = 1;
}

main();