import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];
const passes: string[] = [];

function read(relativePath: string) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function expect(relativePath: string, patterns: string[]) {
  const content = read(relativePath);
  if (!content) return;
  const missing = patterns.filter((pattern) => !content.includes(pattern));
  if (missing.length > 0) {
    failures.push(`${relativePath}: missing ${missing.join(", ")}`);
  } else {
    passes.push(relativePath);
  }
}

expect("lib/admin-engine.ts", ["auth()", 'role === "admin"']);
expect("app/admin/page.tsx", ["isAdminUser", "redirect", "/admin/company-master", "/admin/operations", "/admin/billing"]);
expect("app/admin/company-master/page.tsx", ["isAdminUser", "redirect"]);
expect("app/admin/operations/page.tsx", ["isAdminUser", "redirect"]);
expect("app/admin/billing/page.tsx", ["isAdminUser", "redirect", "getStripe", "stripe.subscriptions.list", "stripe.invoices.list"]);
expect("app/api/admin/company-master/route.ts", ["isAdminUser", "403"]);
expect("app/api/admin/operations/route.ts", ["isAdminUser", "403"]);
expect("app/api/stripe/webhook/route.ts", ["constructEvent", "customer.subscription.updated", "invoice.payment_failed"]);
expect("lib/company-master-runtime.ts", ["loadRuntimeCompanyMasterEntries"]);
expect("app/api/company/[ticker]/peer-comparison/route.ts", ["loadRuntimeCompanyMasterEntries"]);

const packageJson = JSON.parse(read("package.json") || "{}");
if (packageJson.scripts?.["audit:phase9"] !== "tsx scripts/audit-phase9.ts") {
  failures.push("package.json: audit:phase9 script is missing");
} else {
  passes.push("package.json#audit:phase9");
}

console.log("\nPhase 9 audit");
console.log(`PASS: ${passes.length}`);
for (const item of passes) console.log(`  ✓ ${item}`);

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length}`);
  for (const item of failures) console.error(`  ✗ ${item}`);
  process.exit(1);
}

console.log("FAIL: 0");
console.log("Phase 9 operations foundation is present.\n");
