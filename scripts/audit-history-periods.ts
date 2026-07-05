import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

type HistoryRow = {
  year?: number | string;
  fiscalYear?: number | string;
  fiscalMonth?: number | string;
  fiscalPeriod?: string;
  fiscal_period?: string;
  period?: string;
  periodEnd?: string;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

type CompanyAnalysis = {
  ticker: string;
  company_name: string;
  doc_id: string | null;
  history: HistoryRow[] | null;
};

type Severity = "ERROR" | "WARNING" | "INFO";

type AuditIssue = {
  severity: Severity;
  message: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function periodText(row: HistoryRow) {
  return row.fiscalPeriod ?? row.fiscal_period ?? row.period ?? "";
}

function rowYear(row: HistoryRow) {
  const value = Number(row.fiscalYear ?? row.year);
  return Number.isFinite(value) ? value : null;
}

function rowMonth(row: HistoryRow) {
  const value = Number(row.fiscalMonth);
  return Number.isFinite(value) ? value : null;
}

function hasAnyMetric(row: HistoryRow) {
  return [row.revenue, row.operatingIncome, row.operatingCF].some(
    (value) => typeof value === "number" && Number.isFinite(value)
  );
}

function isForeignOrJdr(company: CompanyAnalysis) {
  return (
    company.company_name.includes("ＪＤＲ") ||
    company.company_name.includes("リミテッド") ||
    company.company_name.toLowerCase().includes("limited")
  );
}

function pushIssue(issues: AuditIssue[], severity: Severity, message: string) {
  if (!issues.some((issue) => issue.severity === severity && issue.message === message)) {
    issues.push({ severity, message });
  }
}

function auditCompany(company: CompanyAnalysis) {
  const issues: AuditIssue[] = [];
  const history = Array.isArray(company.history) ? company.history : [];
  const foreignOrJdr = isForeignOrJdr(company);

  if (history.length === 0) {
    pushIssue(issues, "ERROR", "historyなし");
    return issues;
  }

  if (history.length > 3) {
    pushIssue(issues, "INFO", `表示候補が3期超: ${history.length}期（表示側で直近3期に丸めればOK）`);
  }

  const years = history.map(rowYear).filter((value): value is number => value !== null);
  const uniqueYears = new Set(years);
  if (uniqueYears.size !== years.length) {
    pushIssue(issues, "ERROR", "年度重複あり");
  }

  const sortedYears = [...years].sort((a, b) => a - b);
  for (let i = 1; i < sortedYears.length; i += 1) {
    if (sortedYears[i] - sortedYears[i - 1] > 1) {
      const gap = `年度飛び: ${sortedYears[i - 1]}→${sortedYears[i]}`;
      pushIssue(
        issues,
        foreignOrJdr ? "INFO" : "WARNING",
        foreignOrJdr ? `${gap}（外国会社/JDRは会計期間・タグ体系が異なる可能性）` : `${gap}（上場直後・比較情報の欠落なら許容）`
      );
      break;
    }
  }

  for (const row of history) {
    const year = rowYear(row);
    const month = rowMonth(row);
    const period = periodText(row);

    if (!year) {
      pushIssue(issues, "ERROR", "年度なし行あり");
    }

    if (!period) {
      pushIssue(
        issues,
        foreignOrJdr ? "INFO" : "ERROR",
        `${year ?? "不明"}: 決算期表記なし${foreignOrJdr ? "（外国会社/JDRは別対応）" : ""}`
      );
    }

    if (!month) {
      pushIssue(
        issues,
        foreignOrJdr ? "INFO" : "ERROR",
        `${year ?? "不明"}: 決算月なし${foreignOrJdr ? "（外国会社/JDRは別対応）" : ""}`
      );
    }

    if (period && month && !period.includes(`${month}月`)) {
      pushIssue(issues, "ERROR", `${year ?? "不明"}: 決算期表記と決算月が不一致`);
    }

    if (!hasAnyMetric(row)) {
      pushIssue(issues, "ERROR", `${year ?? "不明"}: 主要指標なし`);
    }
  }

  return issues;
}

function severityRank(severity: Severity) {
  if (severity === "ERROR") return 0;
  if (severity === "WARNING") return 1;
  return 2;
}

async function main() {
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase
    .from("company_analyses")
    .select("ticker, company_name, doc_id, history")
    .order("ticker", { ascending: true });

  if (error) throw error;

  const companies = (data ?? []) as CompanyAnalysis[];
  const audited = companies
    .map((company) => ({ company, issues: auditCompany(company) }))
    .filter((item) => item.issues.length > 0);

  const errorItems = audited.filter((item) => item.issues.some((issue) => issue.severity === "ERROR"));
  const warningItems = audited.filter(
    (item) => !item.issues.some((issue) => issue.severity === "ERROR") && item.issues.some((issue) => issue.severity === "WARNING")
  );
  const infoItems = audited.filter((item) =>
    item.issues.every((issue) => issue.severity === "INFO")
  );

  const summary = {
    total: companies.length,
    flagged: audited.length,
    errorCompanies: errorItems.length,
    warningOnlyCompanies: warningItems.length,
    infoOnlyCompanies: infoItems.length,
    missingFiscalMonth: audited.filter((item) =>
      item.issues.some((issue) => issue.message.includes("決算月なし"))
    ).length,
    missingFiscalPeriod: audited.filter((item) =>
      item.issues.some((issue) => issue.message.includes("決算期表記なし"))
    ).length,
    tooManyPeriods: audited.filter((item) =>
      item.issues.some((issue) => issue.message.includes("3期超"))
    ).length,
  };

  console.log("=== history fiscal period audit ===");
  console.log(summary);
  console.log("");

  for (const item of audited.slice(0, 200)) {
    const sortedIssues = [...item.issues].sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity)
    );
    console.log(`${item.company.ticker} ${item.company.company_name}`);
    console.log(`  doc_id: ${item.company.doc_id ?? "なし"}`);
    for (const issue of sortedIssues) {
      console.log(`  [${issue.severity}] ${issue.message}`);
    }
  }

  if (audited.length > 200) {
    console.log(`...and ${audited.length - 200} more`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
