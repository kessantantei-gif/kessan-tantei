import { spawnSync } from "node:child_process";

const includeSync = !process.argv.includes("--skip-sync");
const includeRepairs = process.argv.includes("--with-repairs");
const includeDailyEdinet = process.argv.includes("--with-daily-edinet");

type Step = {
  name: string;
  command: string;
  required: boolean;
};

const steps: Step[] = [
  ...(includeSync
    ? [
        {
          name: "JPX・EDINET会社マスタ同期",
          command: "npm run sync:jpx-markets",
          required: true,
        },
      ]
    : []),
  ...(includeDailyEdinet
    ? [
        {
          name: "EDINET全市場日次同期",
          command: "npm run sync:edinet-daily",
          required: true,
        },
      ]
    : []),
  { name: "Phase 1 DB移行監査", command: "npm run audit:phase1-all-markets", required: true },
  { name: "Phase 2 市場マスタ監査", command: "npm run audit:phase2-market-master", required: true },
  { name: "Phase 3-6 全市場データ監査", command: "npm run audit:all-markets-data", required: true },
  ...(includeRepairs
    ? [
        { name: "財務単位修復", command: "npm run repair:financial-data", required: true },
        { name: "財務コア修復", command: "npm run repair:core-financial-data", required: true },
      ]
    : []),
  { name: "Lint", command: "npm run lint", required: true },
  { name: "Build", command: "npm run build", required: true },
  { name: "財務整合性監査", command: "npm run audit:financial-integrity", required: true },
  { name: "履歴期間監査", command: "npm run audit:history-periods", required: true },
  { name: "Phase 4 監査", command: "npm run audit:phase4", required: true },
  { name: "Phase 7 UI監査", command: "npm run audit:phase7", required: true },
  { name: "Phase 8 ランキング監査", command: "npm run audit:phase8", required: true },
  { name: "Phase 9 会社ページ監査", command: "npm run audit:phase9", required: true },
  { name: "Phase 10 Pro監査", command: "npm run audit:phase10", required: true },
  { name: "Stripe監査", command: "npm run audit:stripe", required: true },
  { name: "SEO監査", command: "npm run audit:seo", required: true },
  { name: "Release監査", command: "npm run audit:release", required: true },
  { name: "最終監査", command: "npm run audit:final", required: true },
];

const failures: string[] = [];

console.log("\n============================================================");
console.log("決算探偵 全市場完全版 統合実行");
console.log(`市場同期: ${includeSync ? "実行" : "省略"}`);
console.log(`EDINET日次同期: ${includeDailyEdinet ? "実行" : "省略"}`);
console.log(`財務修復: ${includeRepairs ? "実行" : "省略"}`);
console.log("============================================================\n");

for (const [index, step] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${step.name}`);
  console.log(`$ ${step.command}\n`);

  const result = spawnSync(step.command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    failures.push(`${step.name} (exit ${result.status ?? "unknown"})`);
    console.error(`\nFAILED: ${step.name}`);
    if (step.required) break;
  } else {
    console.log(`\nPASSED: ${step.name}`);
  }
}

console.log("\n============================================================");
if (failures.length > 0) {
  console.error("全市場完全版 統合実行: FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("最初の失敗箇所を修正してから再実行してください。");
  process.exit(1);
}

console.log("全市場完全版 統合実行: PASSED");
console.log("コード・DB・ビルド・主要監査がすべて成功しました。");
console.log("残る手動受入項目は docs/complete-version-handoff.md を確認してください。");
console.log("============================================================\n");