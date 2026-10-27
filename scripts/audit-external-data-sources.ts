import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const forbiddenEdinetHost = "https://disclosure.edinet-fsa.go.jp/api/v2";
const requiredEdinetHost = "https://api.edinet-fsa.go.jp/api/v2";

function fail(message: string): never {
  throw new Error(`External data source audit failed: ${message}`);
}

const scanRoots = ["scripts", "lib", "app"];
const sourceFiles: string[] = [];

for (const root of scanRoots) {
  const base = path.join(repoRoot, root);
  if (!fs.existsSync(base)) continue;
  const stack = [base];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) sourceFiles.push(full);
    }
  }
}

const auditFilePath = path.resolve(repoRoot, "scripts", "audit-external-data-sources.ts");
const auditedSourceFiles = sourceFiles.filter((file) => path.resolve(file) !== auditFilePath);

const staleEdinet = auditedSourceFiles.filter((file) =>
  fs.readFileSync(file, "utf8").includes(forbiddenEdinetHost)
);
if (staleEdinet.length) {
  fail(`stale EDINET API host remains in: ${staleEdinet.map((file) => path.relative(repoRoot, file)).join(", ")}`);
}

const edinetUsers = auditedSourceFiles.filter((file) =>
  fs.readFileSync(file, "utf8").includes("edinet-fsa.go.jp/api/v2")
);
if (!edinetUsers.length) fail("no EDINET API callers found");
for (const file of edinetUsers) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(requiredEdinetHost)) {
    fail(`EDINET caller does not use official API host: ${path.relative(repoRoot, file)}`);
  }
}

const jpxResolver = path.join(repoRoot, "lib", "jpx-list-source.ts");
if (!fs.existsSync(jpxResolver)) fail("JPX listing resolver is missing");
const jpx = fs.readFileSync(jpxResolver, "utf8");
for (const marker of [
  "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html",
  "data_j.xlsx",
  "resolveJpxListWorkbookUrl",
  'href=["\']([^"\']+)["\']',
]) {
  if (!jpx.includes(marker)) fail(`JPX resolver is missing marker: ${marker}`);
}

for (const file of auditedSourceFiles) {
  const content = fs.readFileSync(file, "utf8");
  if (
    content.includes('tvdivq0000001vg2-att/data_j.xls"') ||
    content.includes("tvdivq0000001vg2-att/data_j.xls'")
  ) {
    fail(`obsolete JPX .xls URL remains in active source: ${path.relative(repoRoot, file)}`);
  }
}

console.log(
  `External data source audit passed: ${edinetUsers.length} EDINET caller(s) use the official API host and JPX listing discovery is enabled.`
);


const analyzeCompanyPath = path.join(repoRoot, "scripts", "analyze-company.ts");
const analyzeCompany = fs.readFileSync(analyzeCompanyPath, "utf8");
if (analyzeCompany.includes("npx tsx scripts/fetch-history.ts")) {
  fail("analyze-company.ts must not invoke fetch-history.ts; use saved document IDs instead");
}
for (const marker of [
  "company_financial_periods",
  "HISTORY_DOC_IDS",
  "loadKnownHistoryDocIDs",
]) {
  if (!analyzeCompany.includes(marker)) {
    fail(`analyze-company.ts is missing stored-history marker: ${marker}`);
  }
}
