import fs from "node:fs";

const criticalWorkflows = [
  "daily-data-refresh.yml",
  "all-markets-nightly.yml",
  "all-markets-backfill.yml",
  "tdnet-backfill.yml",
  "quarterly-disclosures.yml",
];

function fail(message: string): never {
  throw new Error(`Scheduled workflow safety audit failed: ${message}`);
}

const keepalivePath = ".github/workflows/keep-scheduled-workflows-alive.yml";
if (!fs.existsSync(keepalivePath)) fail("keepalive workflow is missing");

const keepalive = fs.readFileSync(keepalivePath, "utf8");
for (const required of [
  'cron: "17 3 1 * *"',
  "automation-keepalive",
  "actions: write",
  "contents: write",
  "scheduled-workflow-keepalive.txt",
  "/enable",
]) {
  if (!keepalive.includes(required)) {
    fail(`keepalive workflow is missing required marker: ${required}`);
  }
}

for (const workflow of criticalWorkflows) {
  const path = `.github/workflows/${workflow}`;
  if (!fs.existsSync(path)) fail(`critical workflow missing: ${workflow}`);

  const content = fs.readFileSync(path, "utf8");
  if (!content.includes("schedule:")) {
    fail(`critical workflow lost its schedule trigger: ${workflow}`);
  }
  if (!keepalive.includes(`"${workflow}"`)) {
    fail(`keepalive workflow does not re-enable: ${workflow}`);
  }
}

const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
if (vercel?.git?.deploymentEnabled?.["automation-keepalive"] !== false) {
  fail("automation-keepalive must be excluded from Vercel deployments");
}

console.log(
  `Scheduled workflow safety audit passed: keepalive protects ${criticalWorkflows.length} scheduled workflows and the keepalive branch is excluded from Vercel.`
);
