import type { RankedCompany, RankingCompany, RankingDefinition } from "./types";

export function rankCompanies(
  companies: RankingCompany[],
  definition: RankingDefinition
): RankedCompany[] {
  return companies
    .filter((company) => company.risk_level !== "EXCLUDED")
    .filter((company) => definition.include?.(company) ?? true)
    .map((company) => ({ company, value: definition.getValue(company) }))
    .filter((item): item is { company: RankingCompany; value: number } =>
      item.value !== null && Number.isFinite(item.value)
    )
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
  const values = (company.history ?? [])
    .map((item) => item[key])
    .filter((value): value is number => typeof value === "number");

  if (values.length < 2) return null;
  return values.at(-1)! - values.at(-2)!;
}

export function latestGrowthRate(
  company: RankingCompany,
  key: "revenue" | "operatingIncome" | "operatingCF"
) {
  const values = (company.history ?? [])
    .map((item) => item[key])
    .filter((value): value is number => typeof value === "number");

  if (values.length < 2 || values.at(-2) === 0) return null;
  return ((values.at(-1)! - values.at(-2)!) / Math.abs(values.at(-2)!)) * 100;
}

export function revenueCagr3(company: RankingCompany) {
  const values = (company.history ?? [])
    .map((item) => item.revenue)
    .filter((value): value is number => typeof value === "number" && value > 0);

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
