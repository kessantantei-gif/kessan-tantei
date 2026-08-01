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
  ranking: "app/ranking/page.tsx",
  companyPage: "app/company/[ticker]/page.tsx",
  companyLayout: "app/company/[ticker]/layout.tsx",
  siteNav: "components/site-nav.tsx",
  marketRanking: "components/market-ranking-page.tsx",
  jsonLd: "components/seo-json-ld.tsx",
  og: "public/og-image-all-markets.png",
};

const sourceRoots = ["app", "components", "lib"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".md"]);

function exists(filePath: string) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function add(items: Item[], severity: Severity, area: Area, message: string) {
  items.push({ severity, area, message });
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

function listSourceFiles(root: string): string[] {
  const absoluteRoot = path.join(process.cwd(), root);
  if (!fs.existsSync(absoluteRoot)) return [];

  const results: string[] = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relative = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...listSourceFiles(relative));
    else if (sourceExtensions.has(path.extname(entry.name))) results.push(relative);
  }
  return results;
}

function auditMetadata(items: Item[]) {
  for (const filePath of [files.layout, files.home, files.markets, files.latestEarnings, files.companyLayout]) {
    if (!exists(filePath)) add(items, "ERROR", "files", `${filePath} is missing`);
  }
  if (!exists(files.layout) || !exists(files.home)) return;

  const layout = read(files.layout);
  const layoutChecks = [
    ["metadataBase", "metadataBase is missing"],
    ["title", "site title metadata is missing"],
    ["description", "site description metadata is missing"],
    ["openGraph", "Open Graph metadata is missing"],
    ["twitter", "Twitter Card metadata is missing"],
    ["verification", "Search Console verification is missing"],
  ] as const;

  for (const [keyword, message] of layoutChecks) {
    if (!layout.includes(keyword)) {
      add(items, keyword === "verification" ? "INFO" : "ERROR", "metadata", message);
    }
  }

  const home = read(files.home);
  if (!/canonical:\s*["']\/["']/.test(home)) {
    add(items, "ERROR", "metadata", "home canonical must point to /");
  }
  if (!home.includes("日本株")) {
    add(items, "ERROR", "copy", "home page does not clearly describe all Japanese stocks");
  }
  if (!home.includes("/latest-earnings")) {
    add(items, "ERROR", "links", "home page does not link to /latest-earnings");
  }

  if (exists(files.markets)) {
    const markets = read(files.markets);
    if (!/canonical:\s*["']\/markets["']/.test(markets)) {
      add(items, "ERROR", "metadata", "/markets page canonical is missing or incorrect");
    }
  }

  if (exists(files.latestEarnings)) {
    const latest = read(files.latestEarnings);
    if (!/canonical:\s*["']\/latest-earnings["']/.test(latest)) {
      add(items, "ERROR", "metadata", "/latest-earnings canonical is missing or incorrect");
    }
    for (const keyword of ["title", "description", "openGraph", "twitter"] as const) {
      if (!latest.includes(keyword)) {
        add(items, "ERROR", "metadata", `/latest-earnings ${keyword} metadata is missing`);
      }
    }
  }

  if (exists(files.companyLayout)) {
    const companyLayout = read(files.companyLayout);
    if (!companyLayout.includes("alternates: { canonical: url }")) {
      add(items, "ERROR", "metadata", "company page canonical metadata is not detected");
    }
    if (!companyLayout.includes("keywords:")) {
      add(items, "WARNING", "metadata", "company-specific keywords are not detected");
    }
  }
}

function auditStructuredData(items: Item[]) {
  if (!exists(files.jsonLd)) {
    add(items, "ERROR", "structured-data", "components/seo-json-ld.tsx is missing");
  }

  if (exists(files.layout)) {
    const layout = read(files.layout);
    if (!layout.includes("SeoJsonLd")) {
      add(items, "WARNING", "structured-data", "site-wide JSON-LD is not mounted in layout");
    }
    if (!layout.includes("websiteJsonLd")) {
      add(items, "WARNING", "structured-data", "website JSON-LD is not mounted");
    }
    if (!layout.includes("organizationJsonLd")) {
      add(items, "WARNING", "structured-data", "organization JSON-LD is not mounted");
    }
  }

  if (exists(files.latestEarnings)) {
    const latest = read(files.latestEarnings);
    for (const keyword of ["application/ld+json", '"@type": "ItemList"', '"@type": "BreadcrumbList"']) {
      if (!latest.includes(keyword)) {
        add(items, "ERROR", "structured-data", `/latest-earnings is missing ${keyword}`);
      }
    }
  }

  if (exists(files.companyLayout)) {
    const companyLayout = read(files.companyLayout);
    for (const keyword of ["application/ld+json", '"@type": "WebPage"', '"@type": "BreadcrumbList"', "tickerSymbol"]) {
      if (!companyLayout.includes(keyword)) {
        add(items, "ERROR", "structured-data", `company page is missing ${keyword}`);
      }
    }
  }

  if (exists(files.ranking) && !read(files.ranking).includes("application/ld+json")) {
    add(items, "WARNING", "structured-data", "ranking page JSON-LD is missing");
  }
}

function auditFiles(items: Item[]) {
  for (const [name, filePath] of Object.entries(files)) {
    if (name === "companyPage") continue;
    if (!exists(filePath)) {
      add(items, name === "og" ? "WARNING" : "ERROR", "files", `${filePath} is missing`);
    }
  }
}

function auditSitemap(items: Item[]) {
  if (!exists(files.sitemap)) return;
  const sitemap = read(files.sitemap);

  for (const keyword of [
    "last_financial_update",
    "last_market_master_update",
    "companyLastModified",
    'path: "/latest-earnings"',
  ]) {
    if (!sitemap.includes(keyword)) {
      add(items, "ERROR", "sitemap", `sitemap does not contain ${keyword}`);
    }
  }

  if (/const\s+now\s*=\s*new\s+Date\(\)/.test(sitemap)) {
    add(items, "ERROR", "sitemap", "sitemap must not assign the current time to every URL");
  }

  if (/companyPages[\s\S]*lastModified:\s*now/.test(sitemap)) {
    add(items, "ERROR", "sitemap", "company pages still use a synthetic current timestamp");
  }
}

function auditCopyAndLinks(items: Item[]) {
  const forbiddenPatterns = [
    { pattern: "グロース市場特化", label: "obsolete growth-only copy" },
    { pattern: "そのグロース株、本当に買って大丈夫ですか？", label: "obsolete company share copy" },
    { pattern: "MARKET MARKET", label: "duplicated market heading" },
  ];

  const sourceFiles = sourceRoots.flatMap(listSourceFiles);
  for (const filePath of sourceFiles) {
    const content = read(filePath);
    for (const forbidden of forbiddenPatterns) {
      if (content.includes(forbidden.pattern)) {
        add(items, "ERROR", "copy", `${forbidden.label}: ${filePath}`);
      }
    }
  }

  const requiredLinks = [
    { file: "components/x-share-button.tsx", value: "#決算探偵" },
    { file: "app/markets/page.tsx", value: "/company/" },
    { file: "components/market-portal-card.tsx", value: "rankingHref" },
    { file: files.siteNav, value: "/latest-earnings" },
    { file: files.latestEarnings, value: "/company/" },
    { file: files.companyLayout, value: "/latest-earnings" },
  ];

  for (const check of requiredLinks) {
    if (!exists(check.file)) {
      add(items, "ERROR", "links", `${check.file} is missing`);
      continue;
    }
    if (!read(check.file).includes(check.value)) {
      add(items, "ERROR", "links", `${check.file} does not contain ${check.value}`);
    }
  }
}

function auditPerformance(items: Item[]) {
  if (!exists(files.layout)) return;
  const layout = read(files.layout);
  if (!layout.includes("SpeedInsights")) {
    add(items, "INFO", "performance", "Vercel Speed Insights is not mounted");
  }
  if (!layout.includes("Analytics")) {
    add(items, "INFO", "performance", "Vercel Analytics is not mounted");
  }
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
  auditMetadata(items);
  auditStructuredData(items);
  auditFiles(items);
  auditSitemap(items);
  auditCopyAndLinks(items);
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
