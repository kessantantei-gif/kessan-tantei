import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];

function file(relativePath: string) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireText(relativePath: string, needles: string[]) {
  const content = file(relativePath);
  for (const needle of needles) {
    if (!content.includes(needle)) {
      failures.push(`${relativePath}: missing text ${needle}`);
    }
  }
}

const requiredFiles = [
  "app/themes/page.tsx",
  "app/themes/[slug]/page.tsx",
  "app/features/page.tsx",
  "app/updates/page.tsx",
  "app/admin/acquisition/page.tsx",
  "app/api/analytics/event/route.ts",
  "components/acquisition-tracker.tsx",
  "components/recent-company-tracker.tsx",
  "components/updates-dashboard-client.tsx",
  "lib/recent-companies.ts",
  "lib/seo-hubs.ts",
  "supabase/migrations/20260712_create_acquisition_events.sql",
];

for (const relativePath of requiredFiles) file(relativePath);

requireText("app/layout.tsx", ["AcquisitionTracker", "RecentCompanyTracker"]);
requireText("app/pricing/actions.ts", ["checkout_start", "utm_source"]);
requireText("app/api/stripe/webhook/route.ts", ["pro_conversion", "utm_source"]);
requireText("app/sitemap.ts", ["/themes", "/features", "/updates"]);
requireText("components/site-nav.tsx", ["/updates", "今日の更新"]);
requireText("app/admin/layout.tsx", ["/admin/acquisition"]);
requireText("app/api/analytics/event/route.ts", ["supabaseAdmin", "acquisition_events"]);
requireText("app/updates/page.tsx", ["isProUser", "UpdatesDashboardClient"]);

if (failures.length > 0) {
  console.error("Phase10 audit failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Phase10 audit passed");
console.log("- SEO theme and feature hubs present");
console.log("- UTM and conversion tracking present");
console.log("- Acquisition admin dashboard present");
console.log("- Daily updates and recent company features present");
console.log("- Sitemap and navigation include Phase10 pages");
