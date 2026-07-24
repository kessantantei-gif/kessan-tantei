import fs from "node:fs";

const path = "app/company/[ticker]/page.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  if (after && source.includes(after)) return;
  if (!source.includes(before)) {
    if (!after || !source.includes(after)) throw new Error(`${label}の置換元が見つかりません`);
    return;
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import FeedbackButton from "@/components/feedback-button";\n',
  'import FeedbackButton from "@/components/feedback-button";\nimport { CompanyEarningsChange, CompanyFinancialTrends } from "@/components/company-quarterly-panels";\nimport type { QuarterlyFinancialRow } from "@/lib/quarterly-financials";\n',
  "import"
);

replaceOnce(
  '  const companyNews = await getCompanyNews(ticker, 5);\n\n  const financials = data.financials ?? {};',
  `  const companyNews = await getCompanyNews(ticker, 5);\n\n  const { data: quarterlyRows } = await supabaseAdmin\n    .from("company_quarterly_financials")\n    .select(\n      "fiscal_year, fiscal_period_end, quarter, cumulative, revenue, operating_income, ordinary_income, profit_attributable_to_owners, operating_cf, created_at, disclosure_id, company_disclosures(source, source_url, disclosed_at, is_correction)"\n    )\n    .eq("ticker", ticker)\n    .order("fiscal_period_end", { ascending: true })\n    .order("quarter", { ascending: true });\n\n  const quarterlyHistory: QuarterlyFinancialRow[] = (quarterlyRows ?? []).map((row: any) => {\n    const disclosure = Array.isArray(row.company_disclosures)\n      ? row.company_disclosures[0]\n      : row.company_disclosures;\n    return {\n      fiscalYear: row.fiscal_year,\n      fiscalPeriodEnd: row.fiscal_period_end,\n      quarter: row.quarter,\n      cumulative: row.cumulative,\n      revenue: row.revenue,\n      operatingIncome: row.operating_income,\n      ordinaryIncome: row.ordinary_income,\n      profitAttributableToOwners: row.profit_attributable_to_owners,\n      operatingCF: row.operating_cf,\n      disclosedAt: disclosure?.disclosed_at ?? row.created_at,\n      source: disclosure?.source ?? "tdnet",\n      sourceUrl: disclosure?.source_url ?? null,\n      isCorrection: disclosure?.is_correction ?? false,\n    };\n  });\n\n  const financials = data.financials ?? {};`,
  "quarterly query"
);

source = source.replace('  const { latest, previous } = getLatestAndPrevious(history);\n', '');

const comparisonHelpersStart = source.indexOf("function pctChange(");
const metadataStart = source.indexOf("export async function generateMetadata", comparisonHelpersStart);
if (comparisonHelpersStart >= 0 && metadataStart > comparisonHelpersStart) {
  source = source.slice(0, comparisonHelpersStart) + source.slice(metadataStart);
}

replaceOnce(
  `        <div data-company-section="financial-trends" className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">\n          <TrendPanel title="売上推移" data={history} keyName="revenue" />\n          <TrendPanel title="営業利益推移" data={history} keyName="operatingIncome" />\n          <TrendPanel title="営業CF推移" data={history} keyName="operatingCF" />\n        </div>`,
  `        <CompanyFinancialTrends annualHistory={history} quarterlyHistory={quarterlyHistory} />`,
  "financial trends"
);

const earningsStart = source.indexOf('          <div data-company-section="earnings"');
const earningsEndMarker = '          <div data-company-section="ai-analysis">';
const earningsEnd = source.indexOf(earningsEndMarker, earningsStart);
if (earningsStart >= 0 && earningsEnd > earningsStart) {
  source =
    source.slice(0, earningsStart) +
    `          <CompanyEarningsChange\n            annualHistory={history}\n            quarterlyHistory={quarterlyHistory}\n            canShowProDetail={canShowProDetail}\n            lockedContent={\n              <ProLock\n                title="決算変化速報はPro限定です"\n                message="最新四半期の前年同期比、赤字転落・黒字化・CF悪化などをProで確認できます。"\n              />\n            }\n          />\n\n` +
    source.slice(earningsEnd);
}

const trendFunctionStart = source.indexOf("function TrendPanel(");
const changeFunctionStart = source.indexOf("function ChangeMetric(");
if (trendFunctionStart >= 0 && changeFunctionStart > trendFunctionStart) {
  source = source.slice(0, trendFunctionStart) + source.slice(changeFunctionStart);
}
const remainingChangeStart = source.indexOf("function ChangeMetric(");
if (remainingChangeStart >= 0) {
  source = source.slice(0, remainingChangeStart).trimEnd() + "\n";
}

fs.writeFileSync(path, source);
console.log("会社ページへ四半期表示を統合しました");
