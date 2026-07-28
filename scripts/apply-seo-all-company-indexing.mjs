import fs from "node:fs";

const path = "app/company/[ticker]/page.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`${label}: 置換元が見つかりません`);
  source = source.replace(before, after);
}

replaceOnce(
  'import FeedbackButton from "@/components/feedback-button";\n',
  'import FeedbackButton from "@/components/feedback-button";\nimport CompanyIndexPlaceholder from "@/components/company-index-placeholder";\n',
  "placeholder import"
);

replaceOnce(
`  const { data } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score")
    .eq("ticker", ticker)
    .maybeSingle();

  const title = data
    ? \`\${data.company_name} (\${data.ticker}) | 決算探偵\`
    : "決算探偵";

  const description = data
    ? \`Score \${data.score} / Danger \${data.danger_score}｜決算データから成長性・収益性・キャッシュ・財務リスクを確認できます。\`
    : "プライム・スタンダード・グロース対応の財務分析ランキング。";`,
`  const [{ data: analysis }, { data: master }] = await Promise.all([
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, company_name, score, danger_score")
      .eq("ticker", ticker)
      .maybeSingle(),
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, market_segment, industry_name, listing_status")
      .eq("ticker", ticker)
      .eq("listing_status", "listed")
      .maybeSingle(),
  ]);

  const companyName = analysis?.company_name ?? master?.company_name;
  const title = companyName
    ? \`\${companyName} (\${ticker})の決算・財務分析 | 決算探偵\`
    : "企業情報 | 決算探偵";

  const description = analysis
    ? \`\${companyName}（\${ticker}）の財務スコア、危険度、売上・利益・キャッシュフロー推移、決算変化を確認できます。\`
    : master
      ? \`\${companyName}（証券コード：\${ticker}）の上場市場、業種、決算・財務分析情報。公式開示資料の取得後にスコアと推移を更新します。\`
      : "プライム・スタンダード・グロース対応の財務分析ランキング。";`,
  "metadata query"
);

replaceOnce(
`  return {
    title,
    description,`,
`  return {
    title,
    description,
    alternates: {
      canonical: \`/company/\${ticker}\`,
    },
    robots: {
      index: Boolean(companyName),
      follow: true,
    },`,
  "metadata canonical"
);

replaceOnce(
`export default async function CompanyPage({ params }: PageProps) {
  const { ticker } = await params;
  const { userId } = await auth();`,
`export default async function CompanyPage({ params }: PageProps) {
  const { ticker } = await params;

  const { data: master } = await supabaseAdmin
    .from("all_market_companies")
    .select("ticker, company_name, market_segment, industry_name, listing_status")
    .eq("ticker", ticker)
    .eq("listing_status", "listed")
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) notFound();
  if (!data) {
    if (!master) notFound();
    return (
      <CompanyIndexPlaceholder
        ticker={master.ticker}
        companyName={master.company_name}
        marketSegment={master.market_segment}
        industryName={master.industry_name}
      />
    );
  }

  const { userId } = await auth();`,
  "page master fallback"
);

replaceOnce(
`  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

`,
"",
  "remove duplicate analysis query"
);

fs.writeFileSync(path, source);
console.log("全上場会社を公開ページ化するSEOパッチを適用しました");
// Workflow trigger: SEO all-company indexing v1
