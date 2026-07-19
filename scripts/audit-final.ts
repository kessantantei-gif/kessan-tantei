import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

config({ path: ".env.local" });

type Severity = "ERROR" | "WARNING" | "INFO";

type Item = {
  severity: Severity;
  category: "ENV" | "DB" | "SEO" | "STRIPE" | "PAGES" | "ACTIONS" | "LEGAL" | "OBSERVABILITY";
  message: string;
};

type Company = {
  ticker: string;
  company_name: string | null;
  score: number | null;
  risk_level: string | null;
  history: unknown[] | null;
};

const requiredFiles = [
  "app/page.tsx",
  "app/ranking/page.tsx",
  "app/pricing/page.tsx",
  "app/profile/page.tsx",
  "app/watchlist/page.tsx",
  "app/alerts/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/legal/page.tsx",
  "app/disclaimer/page.tsx",
  "app/robots.ts",
  "app/sitemap.ts",
  "app/layout.tsx",
  "components/seo-json-ld.tsx",
  "app/api/stripe/webhook/route.ts",
  "app/profile/billing-actions.ts",
  "scripts/audit-release.ts",
  "scripts/audit-seo.ts",
  "scripts/audit-stripe.ts",
  ".github/workflows/release-audit.yml",
];

function exists(filePath: string) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function add(items: Item[], severity: Severity, category: Item["category"], message: string) {
  items.push({ severity, category, message });
}

function env(name: string) {
  return process.env[name];
}

function auditEnv(items: Item[]) {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_APP_URL",
  ];

  for (const name of required) {
    if (!env(name)) add(items, "ERROR", "ENV", `${name} is missing`);
  }

  if (env("STRIPE_SECRET_KEY")?.startsWith("sk_live_")) {
    add(items, "INFO", "STRIPE", "Stripe mode: live");
  } else if (env("STRIPE_SECRET_KEY")?.startsWith("sk_test_")) {
    add(items, "WARNING", "STRIPE", "Stripe mode is test. Switch to live before paid public launch.");
  }

  const appUrl = env("NEXT_PUBLIC_APP_URL");
  if (appUrl && !appUrl.startsWith("https://")) {
    add(items, "WARNING", "ENV", "NEXT_PUBLIC_APP_URL should be https:// in production");
  }
}

function auditFiles(items: Item[]) {
  for (const file of requiredFiles) {
    if (!exists(file)) add(items, "ERROR", "PAGES", `${file} is missing`);
  }

  if (!exists("public/og-image-all-markets.png")) {
    add(items, "WARNING", "SEO", "public/og-image-all-markets.png is missing or not tracked");
  }
}

function auditCodeContent(items: Item[]) {
  if (exists("app/layout.tsx")) {
    const layout = read("app/layout.tsx");
    if (!layout.includes("metadataBase")) add(items, "ERROR", "SEO", "metadataBase is missing");
    if (!layout.includes("alternates")) add(items, "ERROR", "SEO", "canonical alternates metadata is missing");
    if (!layout.includes("openGraph")) add(items, "ERROR", "SEO", "Open Graph metadata is missing");
    if (!layout.includes("twitter")) add(items, "ERROR", "SEO", "Twitter Card metadata is missing");
    if (!layout.includes("SeoJsonLd")) add(items, "WARNING", "SEO", "site-wide JSON-LD is not mounted");
    if (!layout.includes("Analytics")) add(items, "INFO", "OBSERVABILITY", "Vercel Analytics not detected");
    if (!layout.includes("SpeedInsights")) add(items, "INFO", "OBSERVABILITY", "Vercel Speed Insights not detected");
  }

  if (exists("app/api/stripe/webhook/route.ts")) {
    const webhook = read("app/api/stripe/webhook/route.ts");
    const events = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_failed",
    ];
    for (const event of events) {
      if (!webhook.includes(event)) add(items, "ERROR", "STRIPE", `Stripe webhook does not handle ${event}`);
    }
    if (!webhook.includes("constructEvent")) add(items, "ERROR", "STRIPE", "Stripe webhook signature verification is missing");
  }

  if (exists(".github/workflows/release-audit.yml")) {
    const workflow = read(".github/workflows/release-audit.yml");
    if (!workflow.includes("workflow_dispatch")) add(items, "ERROR", "ACTIONS", "release audit workflow_dispatch is missing");
  }
}

async function auditDb(items: Item[]) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  const supabase = createClient(url, key);
  let companies: Company[];

  try {
    companies = await loadAllSupabaseRows<Company>(
      "company_analyses fetch failed",
      (from, to) =>
        supabase
          .from("company_analyses")
          .select("ticker, company_name, score, risk_level, history")
          .neq("risk_level", "EXCLUDED")
          .order("ticker", { ascending: true })
          .range(from, to)
    );
  } catch (error) {
    add(
      items,
      "ERROR",
      "DB",
      error instanceof Error ? error.message : "company_analyses fetch failed"
    );
    return;
  }
  if (companies.length < 500) add(items, "ERROR", "DB", `company count is too low: ${companies.length}`);
  else add(items, "INFO", "DB", `company count: ${companies.length}`);

  const tickerCounts = new Map<string, number>();
  let missingName = 0;
  let missingScore = 0;

  for (const company of companies) {
    tickerCounts.set(company.ticker, (tickerCounts.get(company.ticker) ?? 0) + 1);
    if (!company.company_name) missingName += 1;
    if (typeof company.score !== "number") missingScore += 1;
  }

  const duplicateTickers = [...tickerCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateTickers.length > 0) {
    add(items, "ERROR", "DB", `duplicate tickers: ${duplicateTickers.map(([ticker, count]) => `${ticker}(${count})`).join(", ")}`);
  }
  if (missingName > 0) add(items, "ERROR", "DB", `missing company names: ${missingName}`);
  if (missingScore > 0) add(items, "ERROR", "DB", `missing scores: ${missingScore}`);
}

function auditLegal(items: Item[]) {
  const legalPages = ["app/privacy/page.tsx", "app/terms/page.tsx", "app/legal/page.tsx", "app/disclaimer/page.tsx"];
  for (const page of legalPages) {
    if (!exists(page)) add(items, "ERROR", "LEGAL", `${page} is missing`);
  }
}

function score(items: Item[]) {
  const errors = items.filter((item) => item.severity === "ERROR").length;
  const warnings = items.filter((item) => item.severity === "WARNING").length;
  return Math.max(0, 100 - errors * 20 - warnings * 5);
}

function printGroup(title: string, items: Item[]) {
  console.log(`\n=== ${title} ===`);
  if (items.length === 0) {
    console.log("OK");
    return;
  }
  for (const item of items) console.log(`${item.severity} ${item.category}: ${item.message}`);
}

async function main() {
  const items: Item[] = [];
  auditEnv(items);
  auditFiles(items);
  auditCodeContent(items);
  auditLegal(items);
  await auditDb(items);

  const errors = items.filter((item) => item.severity === "ERROR");
  const warnings = items.filter((item) => item.severity === "WARNING");
  const info = items.filter((item) => item.severity === "INFO");
  const finalScore = score(items);
  const ready = errors.length === 0 && warnings.length === 0;

  console.log("=== FINAL PRODUCTION AUDIT ===");
  console.log({ finalScore, errors: errors.length, warnings: warnings.length, info: info.length });
  console.log(ready ? "READY FOR PRODUCTION" : "NOT READY FOR PRODUCTION");

  printGroup("ERRORS", errors);
  printGroup("WARNINGS", warnings);
  printGroup("INFO", info);

  if (!ready) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
