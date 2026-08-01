import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

type Severity = "ERROR" | "WARNING" | "INFO";
type Area = "metadata" | "structured-data" | "files" | "performance" | "copy" | "links" | "sitemap";

type Item = {
  severity: Severity;
  area: Area;
  message: string;
};

const files = {
  layout: "app/layout.tsx",
  home: "app/page.tsx",
  markets: "app/markets/page.tsx",
  latestEarnings: "app/latest-earnings/page.tsx",
  robots: "app/robots.ts",
  sitemap: "app/sitemap.ts",
  companyLayout: "app/company/[ticker]/layout.tsx",
  siteNav: "components/site-nav.tsx",
  allMarketSearch: "components/all-market-company-search.tsx",
  xShare: "components/x-share-button.tsx",
  jsonLd: "components/seo-json-ld.tsx",
  og: "public/og-image-all-markets.png",
};

function exists(filePath: string) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function add(items: Item[], severity: Severity, area: Area, message: string) {
  items.push({ severity, area, message });
}

function requireFile(items: Item[], filePath: string, warning = false) {
  if (!exists(filePath)) {
    add(items, warning ? "WARNING" : "ERROR", "files", `${filePath} is missing`);
  }
}

function requireText(
  items: Item[],
  filePath: string,
  keyword: string | RegExp,
  area: Area,
  message: string,
  severity: Severity = "ERROR"
) {
  if (!exists(filePath)) {
    add(items, "ERROR", "files", `${filePath} is missing`);
    return;
  }

  const content = read(filePath);
  const found =
    typeof keyword === "string" ? content.includes(keyword) : keyword.test(content);
  if (!found) add(items, severity, area, message);
}

function auditFiles(items: Item[]) {
  for (const [name, filePath] of Object.entries(files)) {
    requireFile(items, filePath, name === "og");
  }
}

function auditMetadata(items: Item[]) {
  for (const keyword of [
    "metadataBase",
    "title",
    "description",
    "openGraph",
    "twitter",
    "verification",
  ]) {
    requireText(
      items,
      files.layout,
      keyword,
      "metadata",
      `site-wide metadata is missing ${keyword}`,
      keyword === "verification" ? "INFO" : "ERROR"
    );
  }

  requireText(
    items,
    files.home,
    /canonical:\s*["']\/["']/,
    "metadata",
    "home canonical must point to /"
  );
  requireText(items, files.home, "日本株", "copy", "home page must describe Japanese stocks");
  requireText(
    items,
    files.markets,
    /canonical:\s*["']\/markets["']/,
    "metadata",
    "/markets canonical is missing or incorrect"
  );
  requireText(
    items,
    files.latestEarnings,
    /canonical:\s*["']\/latest-earnings["']/,
    "metadata",
    "/latest-earnings canonical is missing or incorrect"
  );
  for (const keyword of ["title", "description", "openGraph", "twitter"]) {
    requireText(
      items,
      files.latestEarnings,
      keyword,
      "metadata",
      `/latest-earnings metadata is missing ${keyword}`
    );
  }
  requireText(
    items,
    files.companyLayout,
    "alternates: { canonical: url }",
    "metadata",
    "company canonical metadata is not detected"
  );
  requireText(
    items,
    files.companyLayout,
    "keywords:",
    "metadata",
    "company-specific keywords are not detected",
    "WARNING"
  );
}

function auditStructuredData(items: Item[]) {
  for (const keyword of ["SeoJsonLd", "websiteJsonLd", "organizationJsonLd"]) {
    requireText(
      items,
      files.layout,
      keyword,
      "structured-data",
      `site-wide JSON-LD is missing ${keyword}`
    );
  }

  for (const keyword of [
    "application/ld+json",
    '"@type": "ItemList"',
    '"@type": "BreadcrumbList"',
  ]) {
    requireText(
      items,
      files.latestEarnings,
      keyword,
      "structured-data",
      `/latest-earnings is missing ${keyword}`
    );
  }

  for (const keyword of [
    "application/ld+json",
    '"@type": "WebPage"',
    '"@type": "BreadcrumbList"',
    "tickerSymbol",
  ]) {
    requireText(
      items,
      files.companyLayout,
      keyword,
      "structured-data",
      `company page is missing ${keyword}`
    );
  }
}

function auditSitemap(items: Item[]) {
  for (const keyword of [
    "last_financial_update",
    "last_market_master_update",
    "companyLastModified",
    'path: "/latest-earnings"',
  ]) {
    requireText(
      items,
      files.sitemap,
      keyword,
      "sitemap",
      `sitemap does not contain ${keyword}`
    );
  }

  if (exists(files.sitemap)) {
    const sitemap = read(files.sitemap);
    if (/const\s+now\s*=\s*new\s+Date\(\)/.test(sitemap)) {
      add(items, "ERROR", "sitemap", "sitemap still creates a synthetic current timestamp");
    }
    if (/companyPages[\s\S]*lastModified:\s*now/.test(sitemap)) {
      add(items, "ERROR", "sitemap", "company pages still use a synthetic current timestamp");
    }
  }
}

function auditLinks(items: Item[]) {
  const requiredLinks = [
    { file: files.home, value: "/latest-earnings" },
    { file: files.siteNav, value: "/latest-earnings" },
    { file: files.latestEarnings, value: "/company/" },
    { file: files.companyLayout, value: "/latest-earnings" },
    { file: files.markets, value: "AllMarketCompanySearch" },
    { file: files.allMarketSearch, value: "/company/" },
    { file: files.xShare, value: 'searchParams.set("utm_source", "x")' },
    { file: files.xShare, value: 'searchParams.set("utm_medium", "social")' },
    { file: files.xShare, value: 'searchParams.set("utm_campaign", "company_share")' },
    { file: files.xShare, value: 'searchParams.set("utm_content", ticker)' },
    { file: files.xShare, value: "#決算探偵" },
  ];

  for (const check of requiredLinks) {
    requireText(
      items,
      check.file,
      check.value,
      "links",
      `${check.file} does not contain ${check.value}`
    );
  }
}

function auditCopy(items: Item[]) {
  const checks = [
    { file: files.layout, forbidden: "グロース市場特化" },
    { file: files.home, forbidden: "GROWTH MARKET FINANCIAL DASHBOARD" },
    { file: files.home, forbidden: "グロース市場を、" },
  ];

  for (const check of checks) {
    if (exists(check.file) && read(check.file).includes(check.forbidden)) {
      add(items, "ERROR", "copy", `obsolete copy remains: ${check.file} / ${check.forbidden}`);
    }
  }
}

function auditPerformance(items: Item[]) {
  requireText(
    items,
    files.layout,
    "SpeedInsights",
    "performance",
    "Vercel Speed Insights is not mounted",
    "INFO"
  );
  requireText(
    items,
    files.layout,
    "Analytics",
    "performance",
    "Vercel Analytics is not mounted",
    "INFO"
  );
}

function printGroup(title: string, items: Item[]) {
  console.log(`\n=== ${title} ===`);
  if (items.length === 0) {
    console.log("OK");
    return;
  }
  for (const item of items) console.log(`${item.severity} ${item.area}: ${item.message}`);
}

function score(items: Item[]) {
  const errors = items.filter((item) => item.severity === "ERROR").length;
  const warnings = items.filter((item) => item.severity === "WARNING").length;
  return Math.max(0, 100 - errors * 20 - warnings * 5);
}

function main() {
  const items: Item[] = [];
  auditFiles(items);
  auditMetadata(items);
  auditStructuredData(items);
  auditSitemap(items);
  auditLinks(items);
  auditCopy(items);
  auditPerformance(items);

  const errors = items.filter((item) => item.severity === "ERROR");
  const warnings = items.filter((item) => item.severity === "WARNING");
  const info = items.filter((item) => item.severity === "INFO");

  console.log("=== SEO audit ===");
  console.log({ score: score(items), errors: errors.length, warnings: warnings.length, info: info.length });
  printGroup("ERRORS", errors);
  printGroup("WARNINGS", warnings);
  printGroup("INFO", info);

  if (errors.length > 0) process.exitCode = 1;
}

main();
