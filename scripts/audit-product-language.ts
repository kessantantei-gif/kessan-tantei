import fs from "node:fs";
import path from "node:path";

const publicProductFiles = [
  "app/layout.tsx",
  "app/company/[ticker]/page.tsx",
  "app/growth-home.tsx",
  "app/ranking/page.tsx",
  "app/latest-earnings/page.tsx",
  "app/pricing/page.tsx",
  "app/about-growth/page.tsx",
  "components/company-ai-summary.tsx",
  "components/company-index-placeholder.tsx",
  "components/company-quarterly-panels.tsx",
  "components/RankingCard.tsx",
  "components/ranking-results.tsx",
  "components/financial-insight-panel.tsx",
  "components/pro-value-card.tsx",
  "components/pro-lock.tsx",
  "lib/comment-engine.ts",
  "lib/news-engine.ts",
  "lib/signals.ts",
  "lib/financial-insight-engine.ts",
] as const;

const forbiddenVisiblePhrases = [
  "AI詳細財務分析",
  "AI詳細分析",
  "AI分析全文",
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
  "全社コメント",
] as const;

const requiredByFile: Record<string, readonly string[]> = {
  "app/layout.tsx": ["CompanyAiSummaryInjector"],
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
  "components/company-ai-summary.tsx": [
    "AI決算コメント",
    "プラス材料",
    "警戒材料",
    "次回確認",
    "AIコメント全文",
  ],
  "components/ranking-results.tsx": [
    "RANKING EVIDENCE",
    "Financial {company.score} / Danger {company.danger_score}",
    "指標値・判定根拠",
  ],
  "components/financial-insight-panel.tsx": [
    "KESSAN TANTEI METRICS",
    "決算探偵 固定4指標",
  ],
  "components/pro-value-card.tsx": [
    "判定根拠",
    "決算探偵 固定4指標",
    "Danger Score内訳",
  ],
  "app/pricing/page.tsx": ["判定根拠", "警戒シグナル内訳", "FULL ACCESS"],
  "app/about-growth/page.tsx": ["VERDICT RULES", "表示フォーマット"],
  "lib/signals.ts": ["判定根拠：", "主要警戒シグナル 未検出"],
  "lib/financial-insight-engine.ts": [
    "generateFinancialInsight",
    "productMetrics",
    "利益品質",
    "資金余力",
    "希薄化警戒",
    "決算モメンタム",
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
