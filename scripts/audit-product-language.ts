import fs from "node:fs";
import path from "node:path";

const publicProductFiles = [
  "app/company/[ticker]/page.tsx",
  "app/growth-home.tsx",
  "app/ranking/page.tsx",
  "app/pricing/page.tsx",
  "app/about-growth/page.tsx",
  "components/company-index-placeholder.tsx",
  "components/company-quarterly-panels.tsx",
  "components/RankingCard.tsx",
  "components/financial-insight-panel.tsx",
  "lib/comment-engine.ts",
  "lib/news-engine.ts",
  "lib/financial-insight-engine.ts",
] as const;

const forbiddenVisiblePhrases = [
  "AI詳細財務分析",
  "AI詳細分析",
  "AI分析",
  "EDINET AUTO ANALYSIS",
  "決算探偵の見立て",
  "決算変化速報",
  "今日見るべき企業",
  "可能性があります",
  "考えられます",
  "評価できます",
  "比較的良好",
  "慎重な分析",
  "投資家の評価はまだ定まっていないようです",
] as const;

const requiredByFile: Record<string, readonly string[]> = {
  "app/company/[ticker]/page.tsx": [
    "FINANCIAL SIGNALS / OFFICIAL DISCLOSURES",
    "決算探偵 判定",
    "警戒シグナル",
    "詳細判定",
    "FinancialInsightPanel",
  ],
  "app/growth-home.tsx": [
    "GROWTH MARKET / FINANCIAL SIGNALS",
    "SIGNAL BOARD",
    "Financial Score",
    "Danger Score",
  ],
  "app/ranking/page.tsx": ["比較ルール", "取得済み最新決算を使用"],
  "app/pricing/page.tsx": ["判定根拠", "警戒シグナル内訳", "FULL ACCESS"],
  "app/about-growth/page.tsx": ["VERDICT RULES", "表示フォーマット"],
  "lib/financial-insight-engine.ts": [
    "generateFinancialInsight",
    "nextChecks",
    "evidence",
  ],
};

function read(file: string) {
  const absolute = path.join(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error(`${file} がありません`);
  return fs.readFileSync(absolute, "utf8");
}

function main() {
  const errors: string[] = [];

  for (const file of publicProductFiles) {
    const source = read(file);

    for (const phrase of forbiddenVisiblePhrases) {
      if (source.includes(phrase)) {
        errors.push(`${file}: 旧生成文調の表現が残っています: ${phrase}`);
      }
    }

    for (const required of requiredByFile[file] ?? []) {
      if (!source.includes(required)) {
        errors.push(`${file}: 製品フォーマット必須要素がありません: ${required}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("Product language audit: FAILED");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("Product language audit: PASS");
  console.log(`checked files: ${publicProductFiles.length}`);
  console.log(`forbidden phrases: ${forbiddenVisiblePhrases.length}`);
}

main();
