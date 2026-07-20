import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type FinancialCompany = {
  ticker: string;
  company_name: string;
};

type HistoryRow = {
  fiscalYear?: number | string;
  year?: number | string;
  periodEnd?: string;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingCF?: number | null;
};

type Financials = {
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingCF?: number | null;
  cash?: number | null;
  assets?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  financialProfile?: string;
  revenueLabel?: string;
  operatingIncomeLabel?: string;
  currentRatioApplicable?: boolean;
};

type AnalysisRow = {
  ticker: string;
  company_name: string | null;
  doc_id: string | null;
  financials: Financials | null;
  history: HistoryRow[] | null;
};

type Issue = {
  ticker: string;
  companyName: string;
  field: string;
  message: string;
};

const KNOWN_PROFILES = new Set([
  "general",
  "bank",
  "securities",
  "insurance",
  "special-finance",
  "commodity",
  "ifrs",
  "insurance-ifrs",
  "operating-revenue",
]);

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nearlyEqual(left: number, right: number, tolerance = 0.02) {
  const scale = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / scale <= tolerance;
}

function latestHistoryRow(history: HistoryRow[]) {
  return [...history]
    .sort((left, right) => {
      const leftKey = left.periodEnd ?? String(left.fiscalYear ?? left.year ?? "");
      const rightKey = right.periodEnd ?? String(right.fiscalYear ?? right.year ?? "");
      return leftKey.localeCompare(rightKey);
    })
    .at(-1);
}

function auditCompany(
  company: FinancialCompany,
  analysis: AnalysisRow | undefined
): Issue[] {
  const issues: Issue[] = [];
  const add = (field: string, message: string) => {
    issues.push({
      ticker: company.ticker,
      companyName: company.company_name,
      field,
      message,
    });
  };

  if (!analysis?.doc_id) return issues;

  const financials = analysis.financials ?? {};
  const profile = financials.financialProfile;
  if (!profile || !KNOWN_PROFILES.has(profile)) {
    add(
      "financialProfile",
      `金融業プロファイルが未設定または不正です: ${String(profile)}`
    );
  }
  if (!financials.revenueLabel?.trim()) {
    add("revenueLabel", "収益項目の表示名がありません");
  }
  if (!financials.operatingIncomeLabel?.trim()) {
    add("operatingIncomeLabel", "利益項目の表示名がありません");
  }
  if (typeof financials.currentRatioApplicable !== "boolean") {
    add("currentRatioApplicable", "流動比率の適用可否が未設定です");
  }

  const revenue = finite(financials.revenue);
  const assets = finite(financials.assets);
  const cash = finite(financials.cash);
  if (revenue === null || revenue <= 0) {
    add("revenue", `収益が未取得または0以下です: ${String(financials.revenue)}`);
  }
  if (assets === null || assets <= 0) {
    add("assets", `総資産が未取得または0以下です: ${String(financials.assets)}`);
  }

  if (profile === "bank" || profile === "insurance") {
    if (financials.revenueLabel !== "経常収益") {
      add("revenueLabel", `${profile} は「経常収益」で表示する必要があります`);
    }
    if (financials.operatingIncomeLabel !== "経常利益") {
      add(
        "operatingIncomeLabel",
        `${profile} は「経常利益」で表示する必要があります`
      );
    }
    if (financials.currentRatioApplicable !== false) {
      add(
        "currentRatioApplicable",
        `${profile} に一般会社の流動比率を適用しています`
      );
    }
    if (cash === null || cash <= 0) {
      add(
        "cash",
        `${profile} の現金系項目が未取得または0以下です: ${String(financials.cash)}`
      );
    }
  }

  if (profile === "insurance-ifrs") {
    if (financials.revenueLabel !== "収益") {
      add("revenueLabel", "insurance-ifrs は「収益」で表示する必要があります");
    }
    if (financials.operatingIncomeLabel !== "税引前利益") {
      add("operatingIncomeLabel", "insurance-ifrs は「税引前利益」で表示する必要があります");
    }
    if (financials.currentRatioApplicable !== false) {
      add("currentRatioApplicable", "insurance-ifrs に一般会社の流動比率を適用しています");
    }
  }

  if (profile === "ifrs") {
    if (financials.revenueLabel !== "売上収益") {
      add("revenueLabel", "ifrs は「売上収益」で表示する必要があります");
    }
    if (financials.operatingIncomeLabel !== "営業利益") {
      add("operatingIncomeLabel", "ifrs は「営業利益」で表示する必要があります");
    }
  }

  if (
    profile === "securities" ||
    profile === "special-finance" ||
    profile === "commodity" ||
    profile === "operating-revenue"
  ) {
    if (financials.revenueLabel !== "営業収益") {
      add("revenueLabel", `${profile} は「営業収益」で表示する必要があります`);
    }
    if (financials.operatingIncomeLabel !== "営業利益") {
      add(
        "operatingIncomeLabel",
        `${profile} は「営業利益」で表示する必要があります`
      );
    }
  }

  const history = Array.isArray(analysis.history) ? analysis.history : [];
  if (history.length === 0) {
    add("history", "決算履歴がありません");
    return issues;
  }

  const latest = latestHistoryRow(history);
  if (!latest) {
    add("history", "最新決算期を判定できません");
    return issues;
  }

  const latestRevenue = finite(latest.revenue);
  if (latestRevenue === null || latestRevenue <= 0) {
    add(
      "history.revenue",
      `最新期の収益が未取得または0以下です: ${String(latest.revenue)}`
    );
  }
  if (
    revenue !== null &&
    latestRevenue !== null &&
    !nearlyEqual(revenue, latestRevenue)
  ) {
    add(
      "revenue",
      `financialsと最新履歴が不一致です: financials=${revenue}, history=${latestRevenue}`
    );
  }

  const operatingIncome = finite(financials.operatingIncome);
  const latestOperatingIncome = finite(latest.operatingIncome);
  if (
    operatingIncome !== null &&
    latestOperatingIncome !== null &&
    !nearlyEqual(operatingIncome, latestOperatingIncome)
  ) {
    add(
      "operatingIncome",
      `financialsと最新履歴が不一致です: financials=${operatingIncome}, history=${latestOperatingIncome}`
    );
  }

  return issues;
}

async function main() {
  const [companies, analyses] = await Promise.all([
    loadAllSupabaseRows<FinancialCompany>(
      "金融会社一覧の取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select("ticker, company_name")
          .eq("listing_status", "listed")
          .eq("is_financial", true)
          .eq("is_reit", false)
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
    loadAllSupabaseRows<AnalysisRow>(
      "金融会社分析の取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, company_name, doc_id, financials, history")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
  ]);

  const analysisByTicker = new Map(
    analyses.map((analysis) => [analysis.ticker, analysis])
  );
  const unavailableCompanies = companies
    .filter((company) => !analysisByTicker.get(company.ticker)?.doc_id)
    .map((company) => company.ticker);
  const auditableCompanies = companies.filter(
    (company) => analysisByTicker.get(company.ticker)?.doc_id
  );
  const issues = auditableCompanies.flatMap((company) =>
    auditCompany(company, analysisByTicker.get(company.ticker))
  );

  const profileCounts = new Map<string, number>();
  for (const company of companies) {
    const profile =
      analysisByTicker.get(company.ticker)?.financials?.financialProfile ??
      "missing";
    profileCounts.set(profile, (profileCounts.get(profile) ?? 0) + 1);
  }

  const flaggedCompanies = new Set(issues.map((issue) => issue.ticker)).size;
  const summary = {
    listedFinancialCompanies: companies.length,
    auditedCompanies: auditableCompanies.length,
    unavailableCompanies,
    cleanCompanies: auditableCompanies.length - flaggedCompanies,
    flaggedCompanies,
    totalIssues: issues.length,
    profiles: Object.fromEntries([...profileCounts.entries()].sort()),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    issues,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/financial-sector-audit.json",
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("=== financial sector data audit ===");
  console.log(summary);
  console.log("Report: reports/financial-sector-audit.json");

  for (const issue of issues.slice(0, 100)) {
    console.log(
      `[ERROR] ${issue.ticker} ${issue.companyName} / ${issue.field}: ${issue.message}`
    );
  }
  if (issues.length > 100) {
    console.log(`...and ${issues.length - 100} more issues`);
  }

  if (issues.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
