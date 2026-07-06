import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

type Severity = "ERROR" | "WARNING" | "INFO";

type Item = {
  severity: Severity;
  area: "metadata" | "structured-data" | "files" | "performance";
  message: string;
};

const files = {
  layout: "app/layout.tsx",
  robots: "app/robots.ts",
  sitemap: "app/sitemap.ts",
  ranking: "app/ranking/page.tsx",
  company: "app/company/[ticker]/page.tsx",
  jsonLd: "components/seo-json-ld.tsx",
  og: "public/og-image.png",
};

function exists(filePath: string) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function read(filePath: string) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function add(items: Item[], severity: Severity, area: Item["area"], message: string) {
  items.push({ severity, area, message });
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
    if (!layout.includes(keyword)) add(items, keyword === "verification" ? "INFO" : "ERROR", "metadata", message);
  }
}

function auditStructuredData(items: Item[]) {
  if (!exists(files.jsonLd)) add(items, "ERROR", "structured-data", "components/seo-json-ld.tsx is missing");

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
    if (name === "company") continue;
    if (!exists(filePath)) add(items, name === "og" ? "WARNING" : "ERROR", "files", `${filePath} is missing`);
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
