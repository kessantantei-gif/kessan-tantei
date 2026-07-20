import { readFileSync, writeFileSync } from "node:fs";

const path = "app/company/[ticker]/page.tsx";
let source = readFileSync(path, "utf8");

source = source.replace(
  `import {\n  canViewAiAnalysis,\n  consumeFreeAiUseIfNeeded,\n} from "@/lib/pro-engine";`,
  `import { canViewAiAnalysis } from "@/lib/pro-engine";`
);

const startMarker = `  const { userId } = await auth();`;
const endMarker = `  const rawComments = commentsData ?? [];`;
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  throw new Error("Company page loading block was not found");
}

const replacement = `  const [authResult, aiPermission, companyResult, commentsResult, companyNews] =\n    await Promise.all([\n      auth(),\n      canViewAiAnalysis(),\n      supabaseAdmin\n        .from("company_analyses")\n        .select(\n          "ticker, company_name, score, danger_score, risk_level, doc_id, financials, risk, history, score_breakdown"\n        )\n        .eq("ticker", ticker)\n        .maybeSingle(),\n      supabaseAdmin\n        .from("company_comments")\n        .select(\n          "id, ticker, nickname, body, created_at, clerk_user_id, reply_to_id, deleted_at"\n        )\n        .eq("ticker", ticker)\n        .order("created_at", { ascending: false })\n        .limit(50),\n      getCompanyNews(ticker, 5),\n    ]);\n\n  const { userId } = authResult;\n  const isLoggedIn = Boolean(userId);\n  const { data, error } = companyResult;\n\n  if (error || !data) {\n    notFound();\n  }\n\n  const commentsData = commentsResult.data;\n\n`;

source = source.slice(0, start) + replacement + source.slice(end);
source = source.replace(
  `\n  const companyNews = await getCompanyNews(ticker, 5);\n`,
  `\n`
);

if (source.includes("consumeFreeAiUseIfNeeded")) {
  throw new Error("Automatic AI usage consumption still remains");
}

writeFileSync(path, source, "utf8");
console.log("Company page performance patch applied");
