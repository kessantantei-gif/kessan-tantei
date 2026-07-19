import fs from "node:fs";

const errors: string[] = [];
const route = fs.readFileSync("app/api/company/[ticker]/pro-analysis/route.ts", "utf8");
const component = fs.readFileSync("components/company-pro-analysis.tsx", "utf8");

if (!route.includes("await isProUser()")) errors.push("Pro analysis API lacks server-side Pro check");
if (!route.includes("status: 403")) errors.push("Pro analysis API lacks 403 response");
if (!component.includes('fetch("/api/pro-status"')) errors.push("Pro analysis UI lacks pre-render Pro check");
if (!component.includes('access === "locked"')) errors.push("Pro analysis UI lacks locked state");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Pro boundaries: protected");
