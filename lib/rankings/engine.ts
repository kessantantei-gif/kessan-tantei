import { isRankingExcludedByDataQuality } from "@/lib/data-quality-exclusions";
import type {
  HistoryItem,
  RankedCompany,
  RankingCompany,
  RankingDefinition,
} from "./types";

type GrowthKey = "revenue" | "grossProfit" | "operatingIncome" | "operatingCF" | "netIncome";

type HistoryPoint = {
  year: number;
  value: number;
};

const MIN_PRIOR_REVENUE_FOR_GROWTH_RANKING = 100_000_000;
const MAX_REASONABLE_GROSS_MARGIN = 100;
const MIN_REASONABLE_GROSS_MARGIN = -100;
const MAX_ALLOWED_YEAR_GAP = 2;

function financialNumber(
  company: RankingCompany,
  key: keyof NonNullable<RankingCompany["financials"]>
) {
  const value = company.financials?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function historyYear(item: HistoryItem) {
  const candidates = [
    item.fiscalYear,
    item.year,
    item.fiscalPeriod,
    item.fiscal_period,
    item.period,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const year = Math.trunc(candidate);
      if (year >= 1900 && year <= 2200) return year;
    }

    if (typeof candidate === "string") {
      const match = candidate.match(/(?:19|20|21)\d{2}/);
      if (match) return Number(match[0]);
    }
  }

  return null;
}

function historyPoints(company: RankingCompany, key: GrowthKey): HistoryPoint[] {
  const byYear = new Map<number, number>();

  for (const item of company.history ?? []) {
    const year = historyYear(item);
    const value = item[key];

    if (
      year === null ||
      typeof value !== "number" ||
      !Number.isFinite(value)
    ) {
      continue;
    }

    byYear.set(year, value);
  }

  return [...byYear.entries()]
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);
}

function latestHistoryNumber(company: RankingCompany, key: GrowthKey) {
  const points = historyPoints(company, key);
  return points.length > 0 ? points.at(-1)!.value : null;
}

function latestHistoryPair(company: RankingCompany, key: GrowthKey) {
  const points = historyPoints(company, key);
  if (points.length < 2) return null;

  const previous = points.at(-2)!;
  const current = points.at(-1)!;
  const yearGap = current.year - previous.year;

  if (yearGap < 1 || yearGap > MAX_ALLOWED_YEAR_GAP) return null;

  return {
    previous: previous.value,
    current: current.value,
    previousYear: previous.year,
    currentYear: current.year,
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
  const storedGrossMargin = financialNumber(company, "grossMargin");
  if (isReasonableGrossMargin(storedGrossMargin)) return storedGrossMargin;

  const calculatedGrossMargin = ratio(
    financialNumber(company, "grossProfit") ?? latestHistoryNumber(company, "grossProfit"),
    financialNumber(company, "revenue") ?? latestHistoryNumber(company, "revenue")
  );

  if (isReasonableGrossMargin(calculatedGrossMargin)) return calculatedGrossMargin;
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
    .filter(
      (company) =>
        company.risk_level !== "EXCLUDED" &&
        !isRankingExcludedByDataQuality(company.ticker)
    )
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
  const pair = latestHistoryPair(company, key);
  if (!pair) return null;
  return pair.current - pair.previous;
}

export function latestGrowthRate(
  company: RankingCompany,
  key: "revenue" | "operatingIncome" | "operatingCF"
) {
  return latestHistoryGrowth(company, key);
}

export function revenueCagr3(company: RankingCompany) {
  const points = historyPoints(company, "revenue").filter((point) => point.value > 0);
  if (points.length < 3) return null;

  const selected = points.slice(-4);
  const start = selected[0];
  const end = selected.at(-1)!;
  const periods = end.year - start.year;

  if (periods < 2 || periods > 4) return null;

  for (let index = 1; index < selected.length; index += 1) {
    const gap = selected[index].year - selected[index - 1].year;
    if (gap < 1 || gap > MAX_ALLOWED_YEAR_GAP) return null;
  }

  return (Math.pow(end.value / start.value, 1 / periods) - 1) * 100;
}

export function hasRiskFlag(company: RankingCompany, keywords: string[]) {
  return (company.risk?.flags ?? []).some((flag) =>
    keywords.some((keyword) =>
      `${flag.title ?? ""} ${flag.description ?? ""}`.includes(keyword)
    )
  );
}
