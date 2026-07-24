export type QuarterlyFinancialRow = {
  fiscalYear: number;
  fiscalPeriodEnd: string;
  quarter: 1 | 2 | 3 | 4;
  cumulative: boolean;
  revenue: number | null;
  operatingIncome: number | null;
  ordinaryIncome: number | null;
  profitAttributableToOwners: number | null;
  operatingCF: number | null;
  disclosedAt: string;
  source: "tdnet" | "edinet";
  sourceUrl: string | null;
  isCorrection: boolean;
};

export type AnnualFinancialRow = {
  year?: string | number;
  fiscalYear?: number;
  fiscalPeriod?: string;
  periodEnd?: string;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingCF?: number | null;
};

export type TrendPoint = {
  key: string;
  label: string;
  shortLabel: string;
  periodKind: "annual" | "quarterly";
  quarter: number | null;
  fiscalYear: number | null;
  value: number | null;
  isLatest: boolean;
  sourceUrl: string | null;
};

export type EarningsComparison = {
  periodLabel: string;
  comparisonLabel: string;
  current: QuarterlyFinancialRow | AnnualFinancialRow;
  previous: QuarterlyFinancialRow | AnnualFinancialRow;
  isQuarterly: boolean;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function annualFiscalYear(row: AnnualFinancialRow): number | null {
  if (typeof row.fiscalYear === "number") return row.fiscalYear;
  const numericYear = Number(row.year);
  return Number.isFinite(numericYear) ? numericYear : null;
}

function annualPeriodEnd(row: AnnualFinancialRow): string {
  return row.periodEnd ?? `${annualFiscalYear(row) ?? 0}-12-31`;
}

function annualLabel(row: AnnualFinancialRow): string {
  return row.fiscalPeriod ?? `${annualFiscalYear(row) ?? "—"}年期`;
}

function quarterlyLabel(row: QuarterlyFinancialRow): string {
  const suffix = row.quarter === 4 ? "通期" : `${row.quarter}Q累計`;
  return `${row.fiscalYear}年期 ${suffix}`;
}

export function normalizeQuarterlyRows(rows: QuarterlyFinancialRow[]) {
  const latestByPeriod = new Map<string, QuarterlyFinancialRow>();

  for (const row of rows) {
    const key = `${row.fiscalPeriodEnd}:${row.quarter}`;
    const current = latestByPeriod.get(key);
    if (!current || row.disclosedAt > current.disclosedAt || row.isCorrection) {
      latestByPeriod.set(key, row);
    }
  }

  return [...latestByPeriod.values()].sort((a, b) => {
    const period = a.fiscalPeriodEnd.localeCompare(b.fiscalPeriodEnd);
    if (period !== 0) return period;
    return a.quarter - b.quarter;
  });
}

export function buildTrendPoints(args: {
  annualHistory: AnnualFinancialRow[];
  quarterlyHistory: QuarterlyFinancialRow[];
  metric: "revenue" | "operatingIncome" | "operatingCF";
}): TrendPoint[] {
  const annual = [...args.annualHistory]
    .sort((a, b) => annualPeriodEnd(a).localeCompare(annualPeriodEnd(b)))
    .map<TrendPoint>((row) => ({
      key: `annual:${annualPeriodEnd(row)}`,
      label: annualLabel(row),
      shortLabel: annualLabel(row),
      periodKind: "annual",
      quarter: 4,
      fiscalYear: annualFiscalYear(row),
      value: finiteNumber(row[args.metric]),
      isLatest: false,
      sourceUrl: null,
    }));

  const annualEnds = new Set(annual.map((point) => point.key.replace("annual:", "")));
  const quarterly = normalizeQuarterlyRows(args.quarterlyHistory)
    .filter((row) => !(row.quarter === 4 && annualEnds.has(row.fiscalPeriodEnd)))
    .map<TrendPoint>((row) => ({
      key: `quarterly:${row.fiscalPeriodEnd}:${row.quarter}`,
      label: quarterlyLabel(row),
      shortLabel: row.quarter === 4 ? `${row.fiscalYear} 通期` : `${row.fiscalYear} ${row.quarter}Q`,
      periodKind: "quarterly",
      quarter: row.quarter,
      fiscalYear: row.fiscalYear,
      value: finiteNumber(row[args.metric]),
      isLatest: false,
      sourceUrl: row.sourceUrl,
    }));

  const points = [...annual, ...quarterly].sort((a, b) => a.key.localeCompare(b.key));
  if (points.length > 0) points[points.length - 1] = { ...points[points.length - 1], isLatest: true };
  return points.slice(-8);
}

export function findLatestComparablePeriod(args: {
  annualHistory: AnnualFinancialRow[];
  quarterlyHistory: QuarterlyFinancialRow[];
}): EarningsComparison | null {
  const quarterly = normalizeQuarterlyRows(args.quarterlyHistory);
  const latestQuarter = quarterly.at(-1);

  if (latestQuarter) {
    const previous = [...quarterly]
      .reverse()
      .find(
        (row) =>
          row.quarter === latestQuarter.quarter &&
          row.fiscalYear === latestQuarter.fiscalYear - 1
      );

    if (previous) {
      return {
        periodLabel: quarterlyLabel(latestQuarter),
        comparisonLabel: `前年${latestQuarter.quarter === 4 ? "通期" : `${latestQuarter.quarter}Q累計`}比`,
        current: latestQuarter,
        previous,
        isQuarterly: true,
      };
    }
  }

  const annual = [...args.annualHistory].sort((a, b) =>
    annualPeriodEnd(a).localeCompare(annualPeriodEnd(b))
  );
  if (annual.length < 2) return null;

  return {
    periodLabel: annualLabel(annual[annual.length - 1]),
    comparisonLabel: "前期比",
    current: annual[annual.length - 1],
    previous: annual[annual.length - 2],
    isQuarterly: false,
  };
}

export function metricValue(
  row: QuarterlyFinancialRow | AnnualFinancialRow,
  metric: "revenue" | "operatingIncome" | "operatingCF"
) {
  return finiteNumber(row[metric]);
}
