import type { RankedCompany, RankingCompany, RankingDefinition } from "./types";

type GrowthKey = "revenue" | "grossProfit" | "operatingIncome" | "operatingCF" | "netIncome";

const MIN_PRIOR_REVENUE_FOR_GROWTH_RANKING = 100_000_000;
const MAX_REASONABLE_GROSS_MARGIN = 100;
const MIN_REASONABLE_GROSS_MARGIN = -100;
const GROSS_PROFIT_REVENUE_TOLERANCE = 1.02;

function financialNumber(
  company: RankingCompany,
  key: keyof NonNullable<RankingCompany["financials"]>
) {
  const value = company.financials?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function latestHistoryNumber(company: RankingCompany, key: GrowthKey) {
  const values = historyValues(company, key);
  return values.length > 0 ? values.at(-1)! : null;
}

function historyValues(company: RankingCompany, key: GrowthKey) {
  return (company.history ?? [])
    .map((item) => item[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function latestHistoryPair(company: RankingCompany, key: GrowthKey) {
  const values = historyValues(company, key);
  if (values.length < 2) return null;

  return {
    previous: values.at(-2)!,
    current: values.at(-1)!,
  };
}

function latestHistoryGrowth(company: RankingCompany, key: GrowthKey) {
  const pair = latestHistoryPair(company, key);
  if (!pair || pair.previous === 0) return null;

  return ((pair.current - pair.previous) / Math.abs(pair.previous)) * 100;
}

function ratio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function isReasonableGrossMargin(value: number | null) {
  return (
    value !== null &&
    value >= MIN_REASONABLE_GROSS_MARGIN &&
    value <= MAX_REASONABLE_GROSS_MARGIN
  );
}

function hasReasonableGrossProfitAndRevenue(grossProfit: number | null, revenue: number | null) {
  if (grossProfit === null || revenue === null) return false;
  if (revenue <= 0) return false;

  // 売上総利益が売上高を大きく超える場合は、EDINETタグの取り違え・期間不一致の可能性が高い。
  if (grossProfit > revenue * GROSS_PROFIT_REVENUE_TOLERANCE) return false;

  return true;
}

function hasMeaningfulPriorRevenue(company: RankingCompany) {
  const pair = latestHistoryPair(company, "revenue");
  return pair !== null && pair.previous >= MIN_PRIOR_REVENUE_FOR_GROWTH_RANKING;
}

function isProfitable(company: RankingCompany) {
  return (financialNumber(company, "operatingIncome") ?? 0) > 0;
}

function computedRevenueGrowth(company: RankingCompany) {
  if (!hasMeaningfulPriorRevenue(company)) return null;
  return latestHistoryGrowth(company, "revenue");
}

function computedOperatingMargin(company: RankingCompany) {
  return financialNumber(company, "operatingMargin");
}

function computedGrossMargin(company: RankingCompany) {
  const grossProfit = financialNumber(company, "grossProfit") ?? latestHistoryNumber(company, "grossProfit");
  const revenue = financialNumber(company, "revenue") ?? latestHistoryNumber(company, "revenue");
  const calculatedGrossMargin = hasReasonableGrossProfitAndRevenue(grossProfit, revenue)
    ? ratio(grossProfit, revenue)
    : null;

  if (isReasonableGrossMargin(calculatedGrossMargin)) return calculatedGrossMargin;

  const storedGrossMargin = financialNumber(company, "grossMargin");
  if (isReasonableGrossMargin(storedGrossMargin)) return storedGrossMargin;

  return null;
}

function computedRankingValue(company: RankingCompany, definition: RankingDefinition) {
  const revenueGrowth = computedRevenueGrowth(company);

  if (
    definition.slug === "revenue-growth" ||
    definition.slug === "high-growth" ||
    definition.slug === "profitable-high-growth"
  ) {
    return revenueGrowth;
  }

  if (definition.slug === "gross-margin") {
    return computedGrossMargin(company);
  }

  if (definition.slug === "gross-profit-growth") {
    return latestHistoryGrowth(company, "grossProfit");
  }

  if (definition.slug === "operating-income-growth") {
    return latestHistoryGrowth(company, "operatingIncome");
  }

  if (definition.slug === "net-income-growth") {
    return latestHistoryGrowth(company, "netIncome");
  }

  if (definition.slug === "ocf-growth") {
    return latestHistoryGrowth(company, "operatingCF");
  }

  if (definition.slug === "rule-of-40" || definition.slug === "rule40-excellent") {
    const operatingMargin = computedOperatingMargin(company);
    return revenueGrowth !== null && operatingMargin !== null
      ? revenueGrowth + operatingMargin
      : null;
  }

  return definition.getValue(company);
}

function passesComputedInclude(company: RankingCompany, definition: RankingDefinition, value: number) {
  if (definition.slug === "high-growth") {
    return value >= 20;
  }

  if (definition.slug === "profitable-high-growth") {
    return value >= 20 && isProfitable(company);
  }

  if (definition.slug === "featured-companies") {
    const revenueGrowth = computedRevenueGrowth(company);
    return revenueGrowth !== null && revenueGrowth >= 20;
  }

  if (definition.slug === "recommended") {
    const revenueGrowth = computedRevenueGrowth(company);
    return (
      revenueGrowth !== null &&
      revenueGrowth >= 20 &&
      isProfitable(company) &&
      company.danger_score <= 25
    );
  }

  if (definition.slug === "rule40-excellent") {
    return value >= 40;
  }

  return definition.include?.(company) ?? true;
}

export function rankCompanies(
  companies: RankingCompany[],
  definition: RankingDefinition
): RankedCompany[] {
  return companies
    .filter((company) => company.risk_level !== "EXCLUDED")
    .map((company) => ({ company, value: computedRankingValue(company, definition) }))
    .filter((item): item is { company: RankingCompany; value: number } =>
      item.value !== null && Number.isFinite(item.value)
    )
    .filter((item) => passesComputedInclude(item.company, definition, item.value))
    .sort((a, b) =>
      definition.direction === "desc" ? b.value - a.value : a.value - b.value
    )
    .map(({ company, value }) => ({
      company,
      value,
      comment: definition.comment(company, value),
    }));
}

export function latestChange(
  company: RankingCompany,
  key: "revenue" | "operatingIncome" | "operatingCF"
) {
  const values = historyValues(company, key);

  if (values.length < 2) return null;
  return values.at(-1)! - values.at(-2)!;
}

export function latestGrowthRate(
  company: RankingCompany,
  key: "revenue" | "operatingIncome" | "operatingCF"
) {
  return latestHistoryGrowth(company, key);
}

export function revenueCagr3(company: RankingCompany) {
  const values = historyValues(company, "revenue").filter((value) => value > 0);

  if (values.length < 3) return null;
  const periods = Math.min(values.length - 1, 3);
  const start = values.at(-(periods + 1))!;
  const end = values.at(-1)!;
  return (Math.pow(end / start, 1 / periods) - 1) * 100;
}

export function hasRiskFlag(company: RankingCompany, keywords: string[]) {
  return (company.risk?.flags ?? []).some((flag) =>
    keywords.some((keyword) =>
      `${flag.title ?? ""} ${flag.description ?? ""}`.includes(keyword)
    )
  );
}
