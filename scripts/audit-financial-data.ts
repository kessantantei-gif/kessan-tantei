import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

type Severity = "CRITICAL" | "ERROR" | "WARNING" | "INFO";

type HistoryRow = {
  year?: number | string;
  fiscalYear?: number | string;
  fiscalMonth?: number | string;
  fiscalPeriod?: string;
  fiscal_period?: string;
  period?: string;
  periodEnd?: string;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
  operatingCF?: number | null;
};

type Financials = Record<string, number | boolean | null | undefined>;

type CompanyAnalysis = {
  ticker: string;
  company_name: string;
  doc_id: string | null;
  score: number | null;
  danger_score: number | null;
  risk_level: string | null;
  financials: Financials | null;
  history: HistoryRow[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AuditIssue = {
  ticker: string;
  companyName: string;
  severity: Severity;
  category: string;
  field: string;
  value: string;
  message: string;
};

const AMOUNT_FIELDS = [
  "revenue",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "operatingCF",
  "cash",
  "cashAndDeposits",
  "currentLiabilities",
  "assets",
  "netAssets",
  "equityAmount",
] as const;

const RATIO_RULES: Array<{
  field: string;
  min: number;
  max: number;
  severity: Severity;
  description: string;
}> = [
  { field: "grossMargin", min: -100, max: 100, severity: "ERROR", description: "売上総利益率" },
  { field: "operatingMargin", min: -1000, max: 100, severity: "WARNING", description: "営業利益率" },
  { field: "netMargin", min: -1000, max: 300, severity: "WARNING", description: "純利益率" },
  { field: "operatingCFMargin", min: -1000, max: 300, severity: "WARNING", description: "営業CFマージン" },
  { field: "ocfMargin", min: -1000, max: 300, severity: "WARNING", description: "営業CFマージン" },
  { field: "equityRatio", min: -500, max: 100, severity: "ERROR", description: "自己資本比率" },
  { field: "cashRatio", min: 0, max: 100000, severity: "WARNING", description: "現金比率" },
  { field: "totalAssetTurnover", min: 0, max: 100, severity: "WARNING", description: "総資産回転率" },
];

const GROWTH_FIELDS = [
  "revenueGrowth",
  "grossProfitGrowth",
  "operatingIncomeGrowth",
  "netIncomeGrowth",
  "operatingCFGrowth",
] as const;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function historyYear(row: HistoryRow) {
  const value = Number(row.fiscalYear ?? row.year);
  return Number.isFinite(value) ? value : null;
}

function historyMonth(row: HistoryRow) {
  const value = Number(row.fiscalMonth);
  return Number.isFinite(value) && value >= 1 && value <= 12 ? value : null;
}

function periodText(row: HistoryRow) {
  return row.fiscalPeriod ?? row.fiscal_period ?? row.period ?? "";
}

function nearlyEqual(a: number, b: number, tolerance = 0.15) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale <= tolerance;
}

function roundedRatio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function roundedGrowth(current: number | null, prior: number | null) {
  if (current === null || prior === null || prior === 0) return null;
  return Number((((current - prior) / Math.abs(prior)) * 100).toFixed(2));
}

function formatValue(value: unknown) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "non-finite";
  return String(value);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function severityRank(severity: Severity) {
  if (severity === "CRITICAL") return 0;
  if (severity === "ERROR") return 1;
  if (severity === "WARNING") return 2;
  return 3;
}

function latestRows(history: HistoryRow[]) {
  return [...history]
    .filter((row) => historyYear(row) !== null)
    .sort((a, b) => Number(historyYear(a)) - Number(historyYear(b)));
}

function auditCompany(company: CompanyAnalysis): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const financials = company.financials ?? {};
  const history = Array.isArray(company.history) ? company.history : [];

  const add = (
    severity: Severity,
    category: string,
    field: string,
    value: unknown,
    message: string
  ) => {
    issues.push({
      ticker: company.ticker,
      companyName: company.company_name,
      severity,
      category,
      field,
      value: formatValue(value),
      message,
    });
  };

  if (!company.ticker || !/^\d{4}|\d{3}[A-Z]$/.test(company.ticker)) {
    add("ERROR", "identity", "ticker", company.ticker, "証券コード形式が想定外です");
  }

  if (company.score !== null && (company.score < 0 || company.score > 100)) {
    add("CRITICAL", "score", "score", company.score, "総合スコアが0〜100の範囲外です");
  }
  if (company.danger_score !== null && (company.danger_score < 0 || company.danger_score > 100)) {
    add("CRITICAL", "score", "danger_score", company.danger_score, "Danger Scoreが0〜100の範囲外です");
  }

  for (const field of AMOUNT_FIELDS) {
    const raw = financials[field];
    if (typeof raw === "number" && !Number.isFinite(raw)) {
      add("CRITICAL", "amount", field, raw, "非有限数が保存されています");
      continue;
    }
    if (raw === 0) {
      const severity: Severity = field === "revenue" || field === "assets" ? "ERROR" : "INFO";
      add(severity, "zero-or-missing", field, raw, "実額ゼロか、欠損をゼロとして保存した可能性があります");
    }
  }

  const revenue = finiteNumber(financials.revenue);
  const grossProfit = finiteNumber(financials.grossProfit);
  const operatingIncome = finiteNumber(financials.operatingIncome);
  const netIncome = finiteNumber(financials.netIncome);
  const operatingCF = finiteNumber(financials.operatingCF);
  const cash = finiteNumber(financials.cash ?? financials.cashAndDeposits);
  const currentLiabilities = finiteNumber(financials.currentLiabilities);
  const assets = finiteNumber(financials.assets);
  const netAssets = finiteNumber(financials.netAssets ?? financials.equityAmount);

  if (revenue !== null && revenue < 0) {
    add("CRITICAL", "amount", "revenue", revenue, "売上高がマイナスです");
  }
  if (assets !== null && assets <= 0) {
    add("CRITICAL", "amount", "assets", assets, "総資産が0以下です");
  }
  if (cash !== null && assets !== null && cash > assets * 1.05) {
    add("ERROR", "balance-sheet", "cash", cash, "現金が総資産を上回っています");
  }
  if (currentLiabilities !== null && currentLiabilities < 0) {
    add("ERROR", "balance-sheet", "currentLiabilities", currentLiabilities, "流動負債がマイナスです");
  }
  if (netAssets !== null && assets !== null && netAssets > assets * 1.05) {
    add("ERROR", "balance-sheet", "netAssets", netAssets, "純資産が総資産を上回っています");
  }
  if (grossProfit !== null && revenue !== null && grossProfit > revenue * 1.02) {
    add("ERROR", "profit-loss", "grossProfit", grossProfit, "売上総利益が売上高を上回っています");
  }

  for (const rule of RATIO_RULES) {
    const value = finiteNumber(financials[rule.field]);
    if (value !== null && (value < rule.min || value > rule.max)) {
      add(
        rule.severity,
        "ratio-range",
        rule.field,
        value,
        `${rule.description}が監査範囲${rule.min}〜${rule.max}を外れています`
      );
    }
  }

  const ratioChecks = [
    ["operatingMargin", roundedRatio(operatingIncome, revenue)],
    ["grossMargin", roundedRatio(grossProfit, revenue)],
    ["netMargin", roundedRatio(netIncome, revenue)],
    ["operatingCFMargin", roundedRatio(operatingCF, revenue)],
    ["ocfMargin", roundedRatio(operatingCF, revenue)],
    ["equityRatio", roundedRatio(netAssets, assets)],
    ["cashRatio", roundedRatio(cash, currentLiabilities)],
  ] as const;

  for (const [field, expected] of ratioChecks) {
    const stored = finiteNumber(financials[field]);
    if (stored !== null && expected !== null && !nearlyEqual(stored, expected, 0.02)) {
      add(
        "ERROR",
        "ratio-consistency",
        field,
        stored,
        `保存値と元金額からの再計算値が不一致です（再計算: ${expected}）`
      );
    }
  }

  for (const field of GROWTH_FIELDS) {
    const value = finiteNumber(financials[field]);
    if (value !== null && Math.abs(value) > 500) {
      add(
        Math.abs(value) > 2000 ? "ERROR" : "WARNING",
        "growth-range",
        field,
        value,
        "成長率が極端です。前期が小額・赤字・単位不一致の可能性があります"
      );
    }
  }

  if (history.length === 0) {
    add("CRITICAL", "history", "history", 0, "決算履歴がありません");
    return issues;
  }

  const ordered = latestRows(history);
  const years = ordered.map(historyYear).filter((year): year is number => year !== null);
  if (new Set(years).size !== years.length) {
    add("ERROR", "history", "year", years.join(","), "決算年度が重複しています");
  }

  const originalYears = history.map(historyYear).filter((year): year is number => year !== null);
  if (originalYears.some((year, index) => index > 0 && year < originalYears[index - 1])) {
    add("WARNING", "history", "year-order", originalYears.join(","), "履歴の年度順が昇順ではありません");
  }

  for (const row of history) {
    const year = historyYear(row);
    const month = historyMonth(row);
    const period = periodText(row);
    const periodEnd = row.periodEnd;

    if (year === null) add("ERROR", "history", "year", row.year, "年度がない履歴行があります");
    if (!period) add("WARNING", "history", "fiscalPeriod", year, "決算期表記がありません");
    if (month === null) add("WARNING", "history", "fiscalMonth", year, "決算月がありません");
    if (period && month !== null && !period.includes(`${month}月`)) {
      add("ERROR", "history", "fiscalPeriod", period, `決算期表記と決算月${month}月が一致しません`);
    }
    if (periodEnd && month !== null) {
      const parsed = new Date(periodEnd);
      if (!Number.isNaN(parsed.getTime()) && parsed.getUTCMonth() + 1 !== month) {
        add("ERROR", "history", "periodEnd", periodEnd, `期末日と決算月${month}月が一致しません`);
      }
    }

    const rowRevenue = finiteNumber(row.revenue);
    if (rowRevenue !== null && rowRevenue < 0) {
      add("CRITICAL", "history", "revenue", rowRevenue, `${year ?? "不明"}年度の売上高がマイナスです`);
    }
  }

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const previousYear = historyYear(previous);
    const currentYear = historyYear(current);

    for (const field of ["revenue", "grossProfit", "operatingIncome", "netIncome", "operatingCF"] as const) {
      const before = finiteNumber(previous[field]);
      const after = finiteNumber(current[field]);
      if (before === null || after === null || before === 0 || after === 0) continue;

      const scaleRatio = Math.max(Math.abs(after / before), Math.abs(before / after));
      if (scaleRatio >= 1000) {
        add(
          "CRITICAL",
          "unit-jump",
          field,
          `${before} -> ${after}`,
          `${previousYear}→${currentYear}で1,000倍以上の変動です。円・千円・百万円の単位混在を疑ってください`
        );
      } else if (scaleRatio >= 100) {
        add(
          "ERROR",
          "unit-jump",
          field,
          `${before} -> ${after}`,
          `${previousYear}→${currentYear}で100倍以上の変動です。単位または期間の混在を確認してください`
        );
      }
    }
  }

  if (ordered.length >= 2) {
    const previous = ordered.at(-2)!;
    const latest = ordered.at(-1)!;

    const growthChecks = [
      ["revenueGrowth", latest.revenue, previous.revenue],
      ["grossProfitGrowth", latest.grossProfit, previous.grossProfit],
      ["operatingIncomeGrowth", latest.operatingIncome, previous.operatingIncome],
      ["netIncomeGrowth", latest.netIncome, previous.netIncome],
      ["operatingCFGrowth", latest.operatingCF, previous.operatingCF],
    ] as const;

    for (const [field, currentRaw, priorRaw] of growthChecks) {
      const current = finiteNumber(currentRaw);
      const prior = finiteNumber(priorRaw);
      const stored = finiteNumber(financials[field]);
      const expected = roundedGrowth(current, prior);

      if (prior !== null && prior <= 0 && stored !== null) {
        add(
          "WARNING",
          "growth-denominator",
          field,
          stored,
          "前期がゼロまたは赤字のため、成長率表示より増減額・黒字転換表示が適切です"
        );
      }
      if (stored !== null && expected !== null && !nearlyEqual(stored, expected, 0.02)) {
        add(
          "ERROR",
          "growth-consistency",
          field,
          stored,
          `保存値と直近2期からの再計算値が不一致です（再計算: ${expected}）`
        );
      }
    }

    const latestFieldChecks = [
      ["revenue", latest.revenue],
      ["grossProfit", latest.grossProfit],
      ["operatingIncome", latest.operatingIncome],
      ["netIncome", latest.netIncome],
      ["operatingCF", latest.operatingCF],
    ] as const;

    for (const [field, historyValueRaw] of latestFieldChecks) {
      const stored = finiteNumber(financials[field]);
      const historyValue = finiteNumber(historyValueRaw);
      if (stored !== null && historyValue !== null && !nearlyEqual(stored, historyValue, 0.02)) {
        add(
          "ERROR",
          "latest-history-consistency",
          field,
          stored,
          `financialsと履歴最新期が不一致です（履歴: ${historyValue}）`
        );
      }
    }
  }

  return issues;
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL ?? requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase
    .from("company_analyses")
    .select(
      "ticker, company_name, doc_id, score, danger_score, risk_level, financials, history, created_at, updated_at"
    )
    .order("ticker", { ascending: true })
    .limit(5000);

  if (error) throw error;

  const companies = (data ?? []) as CompanyAnalysis[];
  const issues = companies.flatMap(auditCompany).sort((a, b) => {
    const severityDifference = severityRank(a.severity) - severityRank(b.severity);
    return severityDifference || a.ticker.localeCompare(b.ticker, "ja");
  });

  const flaggedTickers = new Set(issues.map((issue) => issue.ticker));
  const bySeverity = Object.fromEntries(
    (["CRITICAL", "ERROR", "WARNING", "INFO"] as Severity[]).map((severity) => [
      severity,
      issues.filter((issue) => issue.severity === severity).length,
    ])
  );
  const byCategory = issues.reduce<Record<string, number>>((result, issue) => {
    result[issue.category] = (result[issue.category] ?? 0) + 1;
    return result;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCompanies: companies.length,
      flaggedCompanies: flaggedTickers.size,
      cleanCompanies: companies.length - flaggedTickers.size,
      totalIssues: issues.length,
      bySeverity,
      byCategory,
    },
    issues,
  };

  mkdirSync("reports", { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  const jsonPath = join("reports", `financial-data-audit-${stamp}.json`);
  const csvPath = join("reports", `financial-data-audit-${stamp}.csv`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  const header = ["ticker", "companyName", "severity", "category", "field", "value", "message"];
  const csvRows = [
    header.map(csvCell).join(","),
    ...issues.map((issue) => header.map((key) => csvCell(issue[key as keyof AuditIssue])).join(",")),
  ];
  writeFileSync(csvPath, `\uFEFF${csvRows.join("\n")}`, "utf8");

  console.log("=== financial data audit ===");
  console.log(report.summary);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV : ${csvPath}`);
  console.log("");

  for (const issue of issues.slice(0, 250)) {
    console.log(
      `[${issue.severity}] ${issue.ticker} ${issue.companyName} / ${issue.category} / ${issue.field}: ${issue.message} (${issue.value})`
    );
  }
  if (issues.length > 250) console.log(`...and ${issues.length - 250} more issues`);

  if (bySeverity.CRITICAL > 0) process.exitCode = 2;
  else if (bySeverity.ERROR > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
