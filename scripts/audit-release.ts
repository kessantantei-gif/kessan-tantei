import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

type Severity = "ERROR" | "WARNING" | "INFO";

type AuditItem = {
  category: "ENV" | "DB" | "API" | "PAGE" | "SEO" | "SECURITY";
  severity: Severity;
  message: string;
};

type Company = {
  ticker: string;
  company_name: string | null;
  score: number | null;
  danger_score: number | null;
  financials: unknown;
  history: unknown[] | null;
  risk_level: string | null;
};

const requiredPages = [
  "app/page.tsx",
  "app/ranking/page.tsx",
  "app/news/page.tsx",
  "app/data-quality/page.tsx",
  "app/pricing/page.tsx",
  "app/profile/page.tsx",
  "app/watchlist/page.tsx",
  "app/alerts/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/legal/page.tsx",
  "app/disclaimer/page.tsx",
];

const requiredApiRoutes = [
  "app/api/company/[ticker]/score-explanation/route.ts",
  "app/api/company/[ticker]/ai-summary/route.ts",
  "app/api/company/[ticker]/peer-comparison/route.ts",
  "app/api/company/[ticker]/earnings-flash/route.ts",
  "app/api/company/[ticker]/pro-analysis/route.ts",
];

const requiredSeoFiles = [
  "app/robots.ts",
  "app/sitemap.ts",
  "app/layout.tsx",
];

function exists(filePath: string) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function add(items: AuditItem[], category: AuditItem["category"], severity: Severity, message: string) {
  items.push({ category, severity, message });
}

function env(name: string) {
  return process.env[name];
}

function printGroup(title: string, items: AuditItem[]) {
  console.log(`\n=== ${title} ===`);
  if (items.length === 0) {
    console.log("OK");
    return;
  }
  for (const item of items) {
    console.log(`${item.severity} ${item.category}: ${item.message}`);
  }
}

async function auditDb(items: AuditItem[]) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!url) add(items, "ENV", "ERROR", "NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!key) add(items, "ENV", "ERROR", "SUPABASE_SERVICE_ROLE_KEY is missing");
  if (!url || !key) return;

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, history, risk_level")
    .neq("risk_level", "EXCLUDED")
    .order("ticker", { ascending: true });

  if (error) {
    add(items, "DB", "ERROR", `company_analyses fetch failed: ${error.message}`);
    return;
  }

  const companies = (data ?? []) as Company[];

  if (companies.length < 500) add(items, "DB", "WARNING", `company count is low: ${companies.length}`);
  else add(items, "DB", "INFO", `company count: ${companies.length}`);

  const tickerCounts = new Map<string, number>();
  let missingScore = 0;
  let missingName = 0;
  let missingHistory = 0;

  for (const company of companies) {
    tickerCounts.set(company.ticker, (tickerCounts.get(company.ticker) ?? 0) + 1);
    if (!company.company_name) missingName += 1;
    if (typeof company.score !== "number") missingScore += 1;
    if (!Array.isArray(company.history) || company.history.length === 0) missingHistory += 1;
  }

  const duplicateTickers = [...tickerCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([ticker, count]) => `${ticker}(${count})`);

  if (duplicateTickers.length > 0) {
    add(items, "DB", "ERROR", `duplicate tickers: ${duplicateTickers.join(", ")}`);
  }
  if (missingName > 0) add(items, "DB", "ERROR", `missing company names: ${missingName}`);
  if (missingScore > 0) add(items, "DB", "ERROR", `missing scores: ${missingScore}`);
  if (missingHistory > 0) add(items, "DB", "INFO", `companies with limited history: ${missingHistory}`);
}

function auditFiles(items: AuditItem[]) {
  for (const page of requiredPages) {
    if (!exists(page)) add(items, "PAGE", "ERROR", `${page} is missing`);
  }

  for (const route of requiredApiRoutes) {
    if (!exists(route)) add(items, "API", "ERROR", `${route} is missing`);
  }

  for (const seoFile of requiredSeoFiles) {
    if (!exists(seoFile)) add(items, "SEO", "ERROR", `${seoFile} is missing`);
  }

  if (!exists("public/og-image.png")) {
    add(items, "SEO", "WARNING", "public/og-image.png is missing or not tracked");
  }
}

function auditEnv(items: AuditItem[]) {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ];

  const stripeRecommended = [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_LAUNCH_COUPON_ID",
    "STRIPE_WEBHOOK_SECRET",
  ];

  for (const name of required) {
    if (!env(name)) add(items, "ENV", "ERROR", `${name} is missing`);
  }

  for (const name of stripeRecommended) {
    if (!env(name)) add(items, "ENV", "WARNING", `${name} is missing; required before real paid launch`);
  }

  if (!env("NEXT_PUBLIC_APP_URL")) {
    add(items, "ENV", "WARNING", "NEXT_PUBLIC_APP_URL is missing; fallback may be used");
  }
}

function auditSeoContent(items: AuditItem[]) {
  const layoutPath = path.join(process.cwd(), "app/layout.tsx");
  if (!fs.existsSync(layoutPath)) return;
  const layout = fs.readFileSync(layoutPath, "utf8");

  if (!layout.includes("metadata")) add(items, "SEO", "ERROR", "metadata export is missing in app/layout.tsx");
  if (!layout.includes("openGraph")) add(items, "SEO", "WARNING", "Open Graph metadata is missing");
  if (!layout.includes("twitter")) add(items, "SEO", "WARNING", "Twitter card metadata is missing");
  if (!layout.includes("verification")) add(items, "SEO", "INFO", "Google verification metadata not found or changed");
}

function score(items: AuditItem[]) {
  const errors = items.filter((item) => item.severity === "ERROR").length;
  const warnings = items.filter((item) => item.severity === "WARNING").length;
  return Math.max(0, 100 - errors * 15 - warnings * 3);
}

async function main() {
  const items: AuditItem[] = [];

  auditEnv(items);
  auditFiles(items);
  auditSeoContent(items);
  await auditDb(items);

  const errors = items.filter((item) => item.severity === "ERROR");
  const warnings = items.filter((item) => item.severity === "WARNING");
  const info = items.filter((item) => item.severity === "INFO");
  const releaseScore = score(items);

  console.log("=== release audit ===");
  console.log({
    releaseScore,
    errors: errors.length,
    warnings: warnings.length,
    info: info.length,
  });

  printGroup("ERRORS", errors);
  printGroup("WARNINGS", warnings);
  printGroup("INFO", info);

  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
