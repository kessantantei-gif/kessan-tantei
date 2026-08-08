import fs from "node:fs";
import path from "node:path";

type Severity = "ERROR" | "WARNING" | "INFO";
type Area =
  | "files"
  | "metadata"
  | "robots"
  | "canonical"
  | "sitemap"
  | "company"
  | "links"
  | "structured-data"
  | "production";

type AuditItem = {
  severity: Severity;
  area: Area;
  message: string;
};

const files = {
  layout: "app/layout.tsx",
  home: "app/page.tsx",
  growthHome: "app/growth-home.tsx",
  markets: "app/markets/page.tsx",
  prime: "app/prime/page.tsx",
  standard: "app/standard/page.tsx",
  latestEarnings: "app/latest-earnings/page.tsx",
  marketDirectory: "app/companies/[market]/[[...page]]/page.tsx",
  marketDirectoryData: "lib/market-company-directory.ts",
  marketDirectoryCallout: "components/market-directory-callout.tsx",
  companyPage: "app/company/[ticker]/page.tsx",
  companyLayout: "app/company/[ticker]/layout.tsx",
  companyPlaceholder: "components/company-index-placeholder.tsx",
  robots: "app/robots.ts",
  sitemap: "app/sitemap.ts",
  proxy: "proxy.ts",
  siteNav: "components/site-nav.tsx",
  allMarketSearch: "components/all-market-company-search.tsx",
  productionVerifier: "scripts/verify-production-indexability.ts",
} as const;

function absolute(filePath: string) {
  return path.join(process.cwd(), filePath);
}

function exists(filePath: string) {
  return fs.existsSync(absolute(filePath));
}

function read(filePath: string) {
  return fs.readFileSync(absolute(filePath), "utf8");
}

function add(
  items: AuditItem[],
  severity: Severity,
  area: Area,
  message: string
) {
  items.push({ severity, area, message });
}

function requireFile(items: AuditItem[], filePath: string) {
  if (!exists(filePath)) {
    add(items, "ERROR", "files", `${filePath} is missing`);
  }
}

function requireText(
  items: AuditItem[],
  filePath: string,
  pattern: string | RegExp,
  area: Area,
  message: string
) {
  if (!exists(filePath)) {
    add(items, "ERROR", "files", `${filePath} is missing`);
    return;
  }
  const source = read(filePath);
  const found =
    typeof pattern === "string" ? source.includes(pattern) : pattern.test(source);
  if (!found) add(items, "ERROR", area, message);
}

function forbidText(
  items: AuditItem[],
  filePath: string,
  pattern: string | RegExp,
  area: Area,
  message: string
) {
  if (!exists(filePath)) {
    add(items, "ERROR", "files", `${filePath} is missing`);
    return;
  }
  const source = read(filePath);
  const found =
    typeof pattern === "string" ? source.includes(pattern) : pattern.test(source);
  if (found) add(items, "ERROR", area, message);
}

function auditFiles(items: AuditItem[]) {
  for (const filePath of Object.values(files)) requireFile(items, filePath);
}

function auditGlobalIndexability(items: AuditItem[]) {
  for (const pattern of [
    "metadataBase",
    /robots:\s*\{[\s\S]*?index:\s*true,[\s\S]*?follow:\s*true/,
    /googleBot:\s*\{[\s\S]*?index:\s*true,[\s\S]*?follow:\s*true/,
    "verification",
  ]) {
    requireText(
      items,
      files.layout,
      pattern,
      "metadata",
      `root metadata is missing required indexability setting: ${String(pattern)}`
    );
  }

  requireText(
    items,
    files.robots,
    'allow: "/"',
    "robots",
    "robots.txt must allow the public site root"
  );
  requireText(
    items,
    files.robots,
    "sitemap:",
    "robots",
    "robots.txt must advertise sitemap.xml"
  );
  forbidText(
    items,
    files.robots,
    /disallow:[\s\S]*["']\/company/,
    "robots",
    "robots.txt must never disallow /company"
  );
}

function auditCanonicalHosts(items: AuditItem[]) {
  for (const value of [
    'const WWW_HOST = "www.kessan-tantei.jp"',
    'const CANONICAL_HOST = "kessan-tantei.jp"',
    "REDIRECT_HOSTS",
    "NextResponse.redirect(canonicalUrl, 308)",
  ]) {
    requireText(
      items,
      files.proxy,
      value,
      "canonical",
      `proxy canonical-host enforcement is missing: ${value}`
    );
  }

  requireText(
    items,
    files.home,
    /canonical:\s*["']\/["']/,
    "canonical",
    "Growth top must canonicalize to /"
  );
  requireText(
    items,
    files.markets,
    /canonical:\s*["']\/markets["']/,
    "canonical",
    "/markets canonical is missing"
  );
  requireText(
    items,
    files.latestEarnings,
    /canonical:\s*["']\/latest-earnings["']/,
    "canonical",
    "/latest-earnings canonical is missing"
  );
}

function auditCompanyIndexability(items: AuditItem[]) {
  for (const pattern of [
    "export async function generateMetadata",
    "canonical: `/company/${ticker}`",
    /robots:\s*\{\s*index:\s*true,\s*follow:\s*true,?\s*\}/,
    "openGraph:",
    "twitter:",
  ]) {
    requireText(
      items,
      files.companyPage,
      pattern,
      "company",
      `company page metadata is missing: ${String(pattern)}`
    );
  }

  for (const forbidden of [
    /index:\s*Boolean\(companyName\)/,
    /index:\s*false/,
    /<meta[^>]+(?:robots|googlebot)[^>]+noindex/i,
  ]) {
    forbidText(
      items,
      files.companyPage,
      forbidden,
      "company",
      `company route contains a noindex regression: ${String(forbidden)}`
    );
  }

  for (const forbidden of [
    /<meta[^>]+name=["']robots["'][^>]+noindex/i,
    /<meta[^>]+name=["']googlebot["'][^>]+noindex/i,
  ]) {
    forbidText(
      items,
      files.companyPlaceholder,
      forbidden,
      "company",
      "listed company profile placeholder must never emit noindex"
    );
  }

  for (const required of [
    "直近の開示資料",
    "企業基本情報",
    "company_disclosures",
  ]) {
    requireText(
      items,
      files.companyPlaceholder,
      required,
      "company",
      `pre-analysis company profile lacks useful content: ${required}`
    );
  }

  for (const required of [
    "masterError",
    "analysisError",
    "throw new Error",
    "if (master)",
    "notFound();",
  ]) {
    requireText(
      items,
      files.companyPage,
      required,
      "company",
      `company route transient-error handling is missing: ${required}`
    );
  }
  forbidText(
    items,
    files.companyPage,
    /if\s*\(\s*(?:error|analysisError|masterError)\s*\)\s*notFound\(\)/,
    "company",
    "transient database errors must not be converted to 404"
  );

  if (exists(files.companyLayout) && read(files.companyLayout).includes("generateMetadata")) {
    add(
      items,
      "ERROR",
      "company",
      "company metadata must not be duplicated in layout.tsx"
    );
  }

  for (const required of [
    '"@type": "WebPage"',
    '"@type": "BreadcrumbList"',
    "tickerSymbol",
  ]) {
    requireText(
      items,
      files.companyLayout,
      required,
      "structured-data",
      `company JSON-LD is missing ${required}`
    );
  }
}

function auditSitemap(items: AuditItem[]) {
  for (const required of [
    "loadAllListedCompanies",
    'eq("listing_status", "listed")',
    '.in("market_segment", ["growth", "standard", "prime"])',
    "const companyPages",
    "companies.map",
    "companyLastModified",
    "directoryPages",
    'path: "/latest-earnings"',
  ]) {
    requireText(
      items,
      files.sitemap,
      required,
      "sitemap",
      `sitemap is missing ${required}`
    );
  }

  for (const forbidden of [
    "loadAllAnalyzedTickers",
    "analyzedTickers.has(company.ticker)",
    /path:\s*["']\/growth["']/,
    /const\s+now\s*=\s*new\s+Date\(\)/,
  ]) {
    forbidText(
      items,
      files.sitemap,
      forbidden,
      "sitemap",
      `sitemap contains a regression: ${String(forbidden)}`
    );
  }
}

function auditInternalDiscovery(items: AuditItem[]) {
  for (const required of [
    'eq("listing_status", "listed")',
    "const analysisByTicker",
    "return masters",
    "analyzed: Boolean(analysis)",
    'market-company-directory-v2',
  ]) {
    requireText(
      items,
      files.marketDirectoryData,
      required,
      "links",
      `market company directory must include every listed company: ${required}`
    );
  }

  for (const required of [
    "/company/",
    "company.analyzed",
    "分析準備中",
    "上場企業",
  ]) {
    requireText(
      items,
      files.marketDirectory,
      required,
      "links",
      `market directory is missing crawlable listed-company behavior: ${required}`
    );
  }

  for (const [filePath, required] of [
    [files.home, '<MarketDirectoryCallout marketSlug="growth" />'],
    [files.prime, '<MarketDirectoryCallout marketSlug="prime" />'],
    [files.standard, '<MarketDirectoryCallout marketSlug="standard" />'],
    [files.markets, "/companies/"],
    [files.latestEarnings, "/company/"],
    [files.companyLayout, "/latest-earnings"],
    [files.allMarketSearch, "/company/"],
    [files.siteNav, "/latest-earnings"],
  ] as const) {
    requireText(
      items,
      filePath,
      required,
      "links",
      `${filePath} is missing internal discovery link ${required}`
    );
  }
}

function auditPositioning(items: AuditItem[]) {
  requireText(
    items,
    files.growthHome,
    "GROWTH MARKET FINANCIAL DASHBOARD",
    "metadata",
    "root page must remain the Growth Market dashboard"
  );
  requireText(
    items,
    files.growthHome,
    "グロース市場を、",
    "metadata",
    "root page must remain Growth-market specific"
  );
  requireText(
    items,
    files.markets,
    "プライム・スタンダード・グロース",
    "metadata",
    "/markets must remain the all-market entry"
  );
}

function auditProductionVerifier(items: AuditItem[]) {
  for (const required of [
    "Googlebot/2.1",
    "x-robots-tag",
    "hasNoindex",
    "canonicalFromHtml",
    "verifySitemap",
    "verifyHostCanonicalization",
    "verifyCompany",
    "status === 200",
    "sitemap の会社URL数",
  ]) {
    requireText(
      items,
      files.productionVerifier,
      required,
      "production",
      `live production verifier is missing ${required}`
    );
  }
}

function score(items: AuditItem[]) {
  const errors = items.filter((item) => item.severity === "ERROR").length;
  const warnings = items.filter((item) => item.severity === "WARNING").length;
  return Math.max(0, 100 - errors * 20 - warnings * 5);
}

function main() {
  const items: AuditItem[] = [];
  auditFiles(items);
  auditGlobalIndexability(items);
  auditCanonicalHosts(items);
  auditCompanyIndexability(items);
  auditSitemap(items);
  auditInternalDiscovery(items);
  auditPositioning(items);
  auditProductionVerifier(items);

  const errors = items.filter((item) => item.severity === "ERROR");
  const warnings = items.filter((item) => item.severity === "WARNING");
  const info = items.filter((item) => item.severity === "INFO");

  console.log("=== SEO / indexability audit ===");
  console.log({ score: score(items), errors: errors.length, warnings: warnings.length, info: info.length });

  for (const group of [
    ["ERRORS", errors],
    ["WARNINGS", warnings],
    ["INFO", info],
  ] as const) {
    console.log(`\n=== ${group[0]} ===`);
    if (group[1].length === 0) {
      console.log("OK");
    } else {
      for (const item of group[1]) {
        console.log(`${item.severity} ${item.area}: ${item.message}`);
      }
    }
  }

  if (errors.length > 0) process.exitCode = 1;
}

main();
