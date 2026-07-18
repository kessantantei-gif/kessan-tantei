import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

type Severity = "ERROR" | "WARNING" | "INFO";

type Item = {
  severity: Severity;
  area: "metadata" | "structured-data" | "files" | "performance" | "copy" | "links";
  message: string;
};

const files = {
  layout: "app/layout.tsx",
  markets: "app/markets/page.tsx",
  robots: "app/robots.ts",
  sitemap: "app/sitemap.ts",
  ranking: "app/ranking/page.tsx",
  companyPage: "app/company/[ticker]/page.tsx",
  companyLayout: "app/company/[ticker]/layout.tsx",
  marketRanking: "components/market-ranking-page.tsx",
  jsonLd: "components/seo-json-ld.tsx",
  og: "public/og-image.png",
};

const sourceRoots = ["app", "components", "lib"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".md"]);

function exists(filePath: string) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function add(items: Item[], severity: Severity, area: Item["area"], message: string) {
  items.push({ severity, area, message });
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
  if (!exists(files.layout)) {
    add(items, "ERROR", "metadata", "app/layout.tsx is missing");
    return;
  }

  const layout = read(files.layout);
  const checks = [
    ["metadataBase", "metadataBase is missing"],
    ["title", "title metadata is missing"],
    ["description", "description metadata is missing"],
    ["alternates", "canonical alternates metadata is missing"],
    ["openGraph", "Open Graph metadata is missing"],
    ["twitter", "Twitter Card metadata is missing"],
    ["verification", "Search Console verification is missing"],
  ] as const;

  for (const [keyword, message] of checks) {
    if (!layout.includes(keyword)) {
      add(items, keyword === "verification" ? "INFO" : "ERROR", "metadata", message);
    }
  }

  if (!/canonical:\s*["']\/["']/.test(layout)) {
    add(items, "ERROR", "metadata", "root canonical must point to /");
  }
  if (/canonical:\s*["']\/markets["']/.test(layout)) {
    add(items, "ERROR", "metadata", "root layout must not force /markets as canonical");
  }

  if (exists(files.markets)) {
    const markets = read(files.markets);
    if (!/canonical:\s*["']\/markets["']/.test(markets)) {
      add(items, "ERROR", "metadata", "/markets page canonical is missing or incorrect");
    }
  }

  if (exists(files.companyLayout)) {
    const companyLayout = read(files.companyLayout);
    if (!companyLayout.includes("alternates: { canonical: url }")) {
      add(items, "WARNING", "metadata", "company page canonical metadata is not detected");
    }
  }
}

function auditStructuredData(items: Item[]) {
  if (!exists(files.jsonLd)) {
    add(items, "ERROR", "structured-data", "components/seo-json-ld.tsx is missing");
  }

  if (exists(files.layout)) {
    const layout = read(files.layout);
    if (!layout.includes("SeoJsonLd")) add(items, "WARNING", "structured-data", "site-wide JSON-LD is not mounted in layout");
    if (!layout.includes("websiteJsonLd")) add(items, "WARNING", "structured-data", "website JSON-LD is not mounted");
    if (!layout.includes("organizationJsonLd")) add(items, "WARNING", "structured-data", "organization JSON-LD is not mounted");
  }

  if (exists(files.ranking)) {
    const ranking = read(files.ranking);
    if (!ranking.includes("application/ld+json")) add(items, "WARNING", "structured-data", "ranking page JSON-LD is missing");
  }
}

function auditFiles(items: Item[]) {
  for (const [name, filePath] of Object.entries(files)) {
    if (name === "companyPage") continue;
    if (!exists(filePath)) add(items, name === "og" ? "WARNING" : "ERROR", "files", `${filePath} is missing`);
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
  if (exists(files.layout)) {
    const layout = read(files.layout);
    if (!layout.includes("SpeedInsights")) add(items, "INFO", "performance", "Vercel Speed Insights is not mounted");
    if (!layout.includes("Analytics")) add(items, "INFO", "performance", "Vercel Analytics is not mounted");
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