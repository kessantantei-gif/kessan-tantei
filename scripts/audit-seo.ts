import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

type Severity = "ERROR" | "WARNING" | "INFO";
type Area =
  | "metadata"
  | "structured-data"
  | "files"
  | "performance"
  | "copy"
  | "links"
  | "sitemap";

type Item = {
  severity: Severity;
  area: Area;
  message: string;
};

const files = {
  layout: "app/layout.tsx",
  home: "app/page.tsx",
  growthHome: "app/growth-home.tsx",
  growthOg: "app/opengraph-image.tsx",
  markets: "app/markets/page.tsx",
  prime: "app/prime/page.tsx",
  standard: "app/standard/page.tsx",
  latestEarnings: "app/latest-earnings/page.tsx",
  marketDirectory: "app/companies/[market]/[[...page]]/page.tsx",
  marketDirectoryData: "lib/market-company-directory.ts",
  marketDirectoryCallout: "components/market-directory-callout.tsx",
  robots: "app/robots.ts",
  sitemap: "app/sitemap.ts",
  companyPage: "app/company/[ticker]/page.tsx",
  companyLayout: "app/company/[ticker]/layout.tsx",
  companyPlaceholder: "components/company-index-placeholder.tsx",
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

function forbidText(
  items: Item[],
  filePath: string,
  keyword: string | RegExp,
  area: Area,
  message: string
) {
  if (!exists(filePath)) {
    add(items, "ERROR", "files", `${filePath} is missing`);
    return;
  }

  const content = read(filePath);
  const found =
    typeof keyword === "string" ? content.includes(keyword) : keyword.test(content);
  if (found) add(items, "ERROR", area, message);
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

  for (const keyword of [
    /canonical:\s*["']\/["']/,
    "グロース市場",
    "openGraph",
    "twitter",
    "/opengraph-image",
  ]) {
    requireText(
      items,
      files.home,
      keyword,
      "metadata",
      `root Growth page metadata is missing ${String(keyword)}`
    );
  }

  for (const keyword of [
    "ImageResponse",
    "GROWTH MARKET",
    "グロース市場を、決算から見抜く",
  ]) {
    requireText(
      items,
      files.growthOg,
      keyword,
      "metadata",
      `Growth Open Graph image is missing ${keyword}`
    );
  }

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

  for (const keyword of [
    "export async function generateMetadata",
    "alternates:",
    "canonical:",
    "robots:",
    "openGraph:",
    "twitter:",
  ]) {
    requireText(
      items,
      files.companyPage,
      keyword,
      "metadata",
      `company page metadata is missing ${keyword}`
    );
  }

  for (const keyword of [
    "export async function generateMetadata",
    "alternates: { canonical }",
    "robots: { index: true, follow: true }",
    "openGraph:",
    "twitter:",
    "pageNumberFromParts",
    "redirect(pagePath(market.slug, 1))",
  ]) {
    requireText(
      items,
      files.marketDirectory,
      keyword,
      "metadata",
      `market company directory metadata is missing ${keyword}`
    );
  }

  forbidText(
    items,
    files.companyPlaceholder,
    '<meta name="robots" content="noindex,follow" />',
    "metadata",
    "indexable company profile must not include robots noindex"
  );
  forbidText(
    items,
    files.companyPlaceholder,
    '<meta name="googlebot" content="noindex,follow" />',
    "metadata",
    "indexable company profile must not include googlebot noindex"
  );

  requireText(
    items,
    files.companyPlaceholder,
    "直近の開示資料",
    "copy",
    "indexable company profile must contain useful company-specific disclosure content"
  );

  if (exists(files.companyLayout) && read(files.companyLayout).includes("generateMetadata")) {
    add(
      items,
      "ERROR",
      "metadata",
      "company metadata is duplicated between page.tsx and layout.tsx"
    );
  }
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
    requireText(
      items,
      files.marketDirectory,
      keyword,
      "structured-data",
      `market company directory is missing ${keyword}`
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
    "loadAllListedCompanies",
    'eq("listing_status", "listed")',
    "MARKET_COMPANY_PAGE_SIZE",
    "marketDirectoryPath",
    "directoryPages",
    "market_segment",
    "const companyPages",
    "companies.map",
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
    if (/path:\s*["']\/growth["']/.test(sitemap)) {
      add(items, "ERROR", "sitemap", "redirect URL /growth must not be included in sitemap");
    }
    if (sitemap.includes("loadAllAnalyzedTickers")) {
      add(items, "ERROR", "sitemap", "company sitemap must not exclude listed companies that are still awaiting analysis");
    }
    if (sitemap.includes("analyzedTickers.has(company.ticker)")) {
      add(items, "ERROR", "sitemap", "company sitemap must include all listed company profile URLs");
    }
    if (!sitemap.includes("...directoryPages")) {
      add(items, "ERROR", "sitemap", "market directory pages are not returned by sitemap");
    }
  }
}

function auditLinks(items: Item[]) {
  const requiredLinks = [
    { file: files.growthHome, value: "/ranking" },
    { file: files.home, value: '<MarketDirectoryCallout marketSlug="growth" />' },
    { file: files.prime, value: '<MarketDirectoryCallout marketSlug="prime" />' },
    { file: files.standard, value: '<MarketDirectoryCallout marketSlug="standard" />' },
    { file: files.marketDirectoryCallout, value: "/companies/" },
    { file: files.markets, value: "/companies/" },
    { file: files.marketDirectory, value: "/company/" },
    { file: files.marketDirectory, value: "/companies/" },
    { file: files.siteNav, value: "/latest-earnings" },
    { file: files.latestEarnings, value: "/company/" },
    { file: files.companyLayout, value: "/latest-earnings" },
    { file: files.markets, value: "AllMarketCompanySearch" },
    { file: files.allMarketSearch, value: "/company/" },
    { file: files.companyPlaceholder, value: 'if (value === "growth") return "/"' },
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

  for (const keyword of [
    "MARKET_COMPANY_PAGE_SIZE = 100",
    "unstable_cache",
    'eq("listing_status", "listed")',
    'neq("risk_level", "EXCLUDED")',
  ]) {
    requireText(
      items,
      files.marketDirectoryData,
      keyword,
      "links",
      `market directory data loader is missing ${keyword}`
    );
  }
}

function auditCopy(items: Item[]) {
  requireText(
    items,
    files.growthHome,
    "GROWTH MARKET FINANCIAL DASHBOARD",
    "copy",
    "root page must remain the Growth Market dashboard"
  );
  requireText(
    items,
    files.growthHome,
    "グロース市場を、",
    "copy",
    "root page Growth Market heading is missing"
  );
  requireText(
    items,
    files.markets,
    "プライム・スタンダード・グロース",
    "copy",
    "/markets must remain the all-market entry"
  );
  requireText(
    items,
    files.marketDirectory,
    "決算探偵で財務分析が完了している",
    "copy",
    "market company directory must explain that only analyzed companies are listed"
  );

  const forbiddenChecks = [
    { file: files.layout, forbidden: "グロース市場特化" },
    { file: files.growthHome, forbidden: "JAPAN STOCK EARNINGS & FINANCIAL DASHBOARD" },
    { file: files.growthHome, forbidden: "日本株を、" },
  ];

  for (const check of forbiddenChecks) {
    if (exists(check.file) && read(check.file).includes(check.forbidden)) {
      add(items, "ERROR", "copy", `incorrect copy remains: ${check.file} / ${check.forbidden}`);
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
  requireText(
    items,
    files.marketDirectoryData,
    "revalidate: 3600",
    "performance",
    "market company directory data must be cached"
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
  console.log({
    score: score(items),
    errors: errors.length,
    warnings: warnings.length,
    info: info.length,
  });
  printGroup("ERRORS", errors);
  printGroup("WARNINGS", warnings);
  printGroup("INFO", info);

  if (errors.length > 0) process.exitCode = 1;
}

main();
