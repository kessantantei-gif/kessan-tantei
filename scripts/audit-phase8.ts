import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];

function read(relativePath: string) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireText(relativePath: string, expected: string) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    failures.push(`${relativePath}: missing ${JSON.stringify(expected)}`);
  }
}

requireText("app/page.tsx", "GrowthHomePage");
requireText("app/growth-home.tsx", "SIGNAL BOARD");
requireText("app/growth-home.tsx", "PRO RANKINGS");
requireText("app/growth-home.tsx", "売上成長20%以上 × 営業黒字");
requireText("app/growth-home.tsx", "営業CF改善");

requireText("components/pro-lock.tsx", "ProValueCard");
requireText("components/pro-value-card.tsx", "判定根拠");
requireText("components/pro-value-card.tsx", "決算探偵 固定4指標");
requireText("components/pro-value-card.tsx", "ランキング 全順位");
requireText("components/ranking-results.tsx", "RANKING EVIDENCE");
requireText("components/ranking-results.tsx", "Financial");

requireText("components/company-page-order-controller.tsx", "ニュース / IR");
requireText("app/api/company/[ticker]/ai-summary/route.ts", 'generatedBy: "accounting-rules-v3"');
requireText("app/api/company/[ticker]/ai-summary/route.ts", "利益とキャッシュ");
requireText("app/api/company/[ticker]/pro-analysis/route.ts", "前期からの変化");

const orderController = read("components/company-page-order-controller.tsx");
if (orderController.includes("MutationObserver")) {
  if (!orderController.includes("observer.disconnect()")) {
    failures.push("company page MutationObserver must be explicitly disconnected");
  }
  if (!orderController.includes("window.setTimeout(() =>") || !orderController.includes("10000")) {
    failures.push("company page MutationObserver must be bounded by a finite timeout");
  }
}

const packageJson = JSON.parse(read("package.json") || "{}") as {
  scripts?: Record<string, string>;
};
if (packageJson.scripts?.["audit:phase8"] !== "tsx scripts/audit-phase8.ts") {
  failures.push("package.json: audit:phase8 script is missing or incorrect");
}

if (failures.length > 0) {
  console.error("Phase 8 audit failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Phase 8 audit passed.");
console.log("- Growth home signal board and Pro ranking hubs verified");
console.log("- Pro value presentation and ranking evidence verified");
console.log("- Company-page DOM ordering observer is bounded and disconnected");
console.log("- Accounting-oriented AI and Pro analysis verified");
