import fs from "node:fs";
import path from "node:path";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

const failures: string[] = [];

function requireText(file: string, text: string) {
  if (!read(file).includes(text)) failures.push(`${file}: missing ${text}`);
}

function forbidText(file: string, text: string) {
  if (read(file).includes(text)) failures.push(`${file}: forbidden ${text}`);
}

const vercelConfig = JSON.parse(read("vercel.json")) as { crons?: unknown[] };
if (Array.isArray(vercelConfig.crons) && vercelConfig.crons.length > 0) {
  failures.push("vercel.json: Vercel Cron must remain disabled; scheduled refresh runs in GitHub Actions");
}

requireText("lib/company-master-runtime.ts", "unstable_cache");
requireText("lib/company-master-runtime.ts", "loadRuntimeCompanyMasterEntry");
requireText("lib/company-master-runtime.ts", "runtime-company-master-entry-v2");
requireText("lib/company-master-runtime.ts", ".eq(\"ticker\", ticker)");

requireText("app/company/[ticker]/layout.tsx", "loadRuntimeCompanyMasterEntry");
requireText("app/company/[ticker]/layout.tsx", "company-layout-context-v2");
forbidText("app/company/[ticker]/layout.tsx", "loadRuntimeCompanyMasterMap");

requireText("components/company-ai-summary.tsx", "cache: \"force-cache\"");
requireText("components/company-ai-summary.tsx", "isSignedIn");
forbidText(
  "components/company-ai-summary.tsx",
  "fetch(`/api/company/${ticker}/ai-summary`, { cache: \"no-store\" })"
);

requireText("next.config.ts", "/api/company/:ticker/ai-summary");
requireText("next.config.ts", "s-maxage=3600");
requireText("next.config.ts", "stale-while-revalidate=86400");

requireText("lib/load-ranking-companies.ts", "unstable_cache");
requireText("lib/load-ranking-companies.ts", "ranking-companies-v2");

// Full-market peer comparisons must use bounded, shared caches rather than
// downloading and decoding thousands of financial records on every request.
requireText("app/api/company/[ticker]/peer-comparison/route.ts", "unstable_cache");
requireText("app/api/company/[ticker]/peer-comparison/route.ts", "loadComparisonPeersPage");
requireText("app/api/company/[ticker]/peer-comparison/route.ts", "loadComparisonMarketsPage");
requireText("app/api/company/[ticker]/peer-comparison/route.ts", "PEER_PAGE_SIZE");
requireText("app/api/company/[ticker]/peer-comparison/route.ts", "s-maxage=900");
requireText("app/api/company/[ticker]/peer-comparison/route.ts", "stale-while-revalidate=1800");

// News search needs the complete listed-company directory for name matching,
// but the lookup must be shared across visitors, without suppressing fresh news.
requireText("app/news/page.tsx", "const loadListedCompanies = unstable_cache(");
requireText("app/news/page.tsx", "const loadMarketTickers = unstable_cache(");
requireText("app/news/page.tsx", 'revalidate: 1800');

if (failures.length > 0) {
  console.error("Vercel CPU regression audit failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Vercel CPU regression audit passed.");
