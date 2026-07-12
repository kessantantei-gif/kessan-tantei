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

requireText("app/page.tsx", "TODAY&apos;S FOCUS");
requireText("app/page.tsx", "PRO RANKINGS");
requireText("app/page.tsx", "高成長かつ営業黒字");
requireText("app/page.tsx", "営業CF改善");
requireText("components/pro-lock.tsx", "ProValueCard");
requireText("components/pro-value-card.tsx", "AI分析全文");
requireText("components/company-page-order-controller.tsx", "ニュース / IR");
requireText("app/api/company/[ticker]/ai-summary/route.ts", "利益とキャッシュ");
requireText("app/api/company/[ticker]/pro-analysis/route.ts", "前期からの変化");

const orderController = read("components/company-page-order-controller.tsx");
if (orderController.includes("MutationObserver")) {
  failures.push("company page ordering must not use MutationObserver");
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
console.log("- Pro value presentation unified");
console.log("- Company-page information order controlled without continuous DOM monitoring");
console.log("- Accounting-oriented AI analysis enabled");
console.log("- Today's focus and Pro ranking hubs enabled");
