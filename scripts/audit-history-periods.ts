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

function auditCompany(company: CompanyAnalysis) {
  const issues: string[] = [];
  const history = Array.isArray(company.history) ? company.history : [];

  if (history.length === 0) {
    issues.push("historyなし");
    return issues;
  }

  if (history.length > 3) {
    issues.push(`表示候補が3期超: ${history.length}期`);
  }

  const years = history.map(rowYear).filter((value): value is number => value !== null);
  const uniqueYears = new Set(years);
  if (uniqueYears.size !== years.length) {
    issues.push("年度重複あり");
  }

  const sortedYears = [...years].sort((a, b) => a - b);
  for (let i = 1; i < sortedYears.length; i += 1) {
    if (sortedYears[i] - sortedYears[i - 1] > 1) {
      issues.push(`年度飛び: ${sortedYears[i - 1]}→${sortedYears[i]}`);
      break;
    }
  }

  for (const row of history) {
    const year = rowYear(row);
    const month = rowMonth(row);
    const period = periodText(row);

    if (!year) {
      issues.push("年度なし行あり");
    }

    if (!period) {
      issues.push(`${year ?? "不明"}: 決算期表記なし`);
    }

    if (!month) {
      issues.push(`${year ?? "不明"}: 決算月なし`);
    }

    if (period && month && !period.includes(`${month}月`)) {
      issues.push(`${year ?? "不明"}: 決算期表記と決算月が不一致`);
    }

    if (!hasAnyMetric(row)) {
      issues.push(`${year ?? "不明"}: 主要指標なし`);
    }
  }

  return [...new Set(issues)];
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
  const bad = companies
    .map((company) => ({ company, issues: auditCompany(company) }))
    .filter((item) => item.issues.length > 0);

  const summary = {
    total: companies.length,
    problematic: bad.length,
    missingFiscalMonth: bad.filter((item) =>
      item.issues.some((issue) => issue.includes("決算月なし"))
    ).length,
    missingFiscalPeriod: bad.filter((item) =>
      item.issues.some((issue) => issue.includes("決算期表記なし"))
    ).length,
    tooManyPeriods: bad.filter((item) =>
      item.issues.some((issue) => issue.includes("3期超"))
    ).length,
  };

  console.log("=== history fiscal period audit ===");
  console.log(summary);
  console.log("");

  for (const item of bad.slice(0, 200)) {
    console.log(`${item.company.ticker} ${item.company.company_name}`);
    console.log(`  doc_id: ${item.company.doc_id ?? "なし"}`);
    console.log(`  issues: ${item.issues.join(" / ")}`);
  }

  if (bad.length > 200) {
    console.log(`...and ${bad.length - 200} more`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
