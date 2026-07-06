import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

type HistoryRow = {
  year?: number | string;
  fiscalYear?: number | string;
  fiscalPeriod?: string;
  fiscal_period?: string;
  period?: string;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  operatingCF?: number | null;
  netIncome?: number | null;
};

type RiskFlag = {
  title?: string;
  description?: string;
  level?: string;
  scoreImpact?: number;
};

type Company = {
  ticker: string;
  company_name: string;
  score: number | null;
  danger_score: number | null;
  financials: Record<string, number | boolean | null | undefined> | null;
  score_breakdown: Record<string, number | null | undefined> | null;
  risk: { flags?: RiskFlag[] } | null;
  history: HistoryRow[] | null;
  risk_level: string | null;
};

type AuditIssue = {
  ticker: string;
  companyName: string;
  feature: "ai-summary" | "score" | "peer" | "earnings";
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function isNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function historyYear(row: HistoryRow) {
  const value = Number(row.fiscalYear ?? row.year);
  return Number.isFinite(value) ? value : null;
}

function metric(company: Company, key: string) {
  const value = company.financials?.[key];
  return isNumber(value) ? value : null;
}

function hasAnyFinancialMetric(company: Company) {
  const f = company.financials ?? {};
  return [
    f.revenueGrowth,
    f.grossProfitGrowth,
    f.operatingMargin,
    f.operatingCFMargin,
    f.ocfMargin,
    f.equityRatio,
    f.cashRatio,
  ].some(isNumber);
}

function hasTwoHistoryPeriods(company: Company) {
  return (company.history ?? []).filter((row) => historyYear(row) !== null).length >= 2;
}

function hasEarningsComparableMetrics(company: Company) {
  const history = [...(company.history ?? [])]
    .filter((row) => historyYear(row) !== null)
    .sort((a, b) => Number(historyYear(a)) - Number(historyYear(b)));

  if (history.length < 2) return false;
  const current = history[history.length - 1];
  const previous = history[history.length - 2];

  return [
    [current.revenue, previous.revenue],
    [current.operatingIncome, previous.operatingIncome],
    [current.operatingCF, previous.operatingCF],
  ].some(([a, b]) => isNumber(a) && isNumber(b));
}

function issue(company: Company, feature: AuditIssue["feature"], severity: AuditIssue["severity"], message: string): AuditIssue {
  return {
    ticker: company.ticker,
    companyName: company.company_name,
    feature,
    severity,
    message,
  };
}

function auditAiSummary(company: Company) {
  const issues: AuditIssue[] = [];
  if (!company.company_name) issues.push(issue(company, "ai-summary", "ERROR", "company_name missing"));
  if (!hasAnyFinancialMetric(company) && !(company.risk?.flags ?? []).length) {
    issues.push(issue(company, "ai-summary", "INFO", "summary source metrics are limited"));
  }
  return issues;
}

function auditScore(company: Company) {
  const issues: AuditIssue[] = [];
  if (!isNumber(company.score)) issues.push(issue(company, "score", "ERROR", "score missing"));
  if (!company.score_breakdown || Object.keys(company.score_breakdown).length === 0) {
    if (!hasAnyFinancialMetric(company)) {
      issues.push(issue(company, "score", "INFO", "score breakdown and fallback metrics are limited"));
    }
  }
  return issues;
}

function auditPeer(company: Company, companies: Company[]) {
  const issues: AuditIssue[] = [];
  const peers = companies
    .filter((peer) => peer.ticker !== company.ticker && peer.risk_level !== "EXCLUDED")
    .map((peer) => ({
      peer,
      distance:
        Math.abs((company.score ?? 0) - (peer.score ?? 0)) * 0.5 +
        ["revenueGrowth", "operatingMargin", "operatingCFMargin", "ocfMargin", "equityRatio"].reduce((sum, key) => {
          const a = metric(company, key);
          const b = metric(peer, key);
          if (a === null || b === null) return sum;
          return sum + Math.abs(a - b);
        }, 0),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (peers.length < 3) issues.push(issue(company, "peer", "ERROR", `peer candidates too few: ${peers.length}`));
  if (peers.some((item) => item.peer.ticker === company.ticker)) {
    issues.push(issue(company, "peer", "ERROR", "target company included in peers"));
  }
  return issues;
}

function auditEarnings(company: Company) {
  const issues: AuditIssue[] = [];
  if (!hasTwoHistoryPeriods(company)) {
    issues.push(issue(company, "earnings", "INFO", "history has less than 2 periods"));
    return issues;
  }
  if (!hasEarningsComparableMetrics(company)) {
    issues.push(issue(company, "earnings", "INFO", "history exists but comparable metrics are limited"));
  }
  return issues;
}

function printGroup(title: string, issues: AuditIssue[]) {
  console.log(`\n=== ${title} ===`);
  if (issues.length === 0) {
    console.log("OK");
    return;
  }
  for (const item of issues.slice(0, 80)) {
    console.log(`${item.severity} ${item.feature} ${item.ticker} ${item.companyName}: ${item.message}`);
  }
  if (issues.length > 80) console.log(`...and ${issues.length - 80} more`);
}

async function main() {
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, score_breakdown, risk, history, risk_level")
    .neq("risk_level", "EXCLUDED")
    .order("ticker", { ascending: true });

  if (error) throw error;

  const companies = (data ?? []) as Company[];
  const issues = companies.flatMap((company) => [
    ...auditAiSummary(company),
    ...auditScore(company),
    ...auditPeer(company, companies),
    ...auditEarnings(company),
  ]);

  const errors = issues.filter((item) => item.severity === "ERROR");
  const warnings = issues.filter((item) => item.severity === "WARNING");
  const info = issues.filter((item) => item.severity === "INFO");

  const byFeature = {
    aiSummary: issues.filter((item) => item.feature === "ai-summary").length,
    score: issues.filter((item) => item.feature === "score").length,
    peer: issues.filter((item) => item.feature === "peer").length,
    earnings: issues.filter((item) => item.feature === "earnings").length,
  };

  console.log("=== phase4 audit ===");
  console.log({
    total: companies.length,
    errors: errors.length,
    warnings: warnings.length,
    info: info.length,
    byFeature,
  });

  printGroup("ERRORS", errors);
  printGroup("WARNINGS", warnings);
  printGroup("INFO / DATA LIMITATIONS", info);

  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
