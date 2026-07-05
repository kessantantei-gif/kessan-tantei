export type RankingCategory =
  | "overall"
  | "growth"
  | "profitability"
  | "cash"
  | "safety"
  | "risk"
  | "industry"
  | "theme";

export type Financials = {
  revenue?: number;
  grossProfit?: number;
  netIncome?: number;
  operatingIncome?: number;
  operatingCF?: number;
  cash?: number;
  currentLiabilities?: number;
  assets?: number;
  netAssets?: number;
  equityRatio?: number;
  revenueGrowth?: number;
  grossProfitGrowth?: number;
  operatingMargin?: number;
  ocfMargin?: number;
  operatingCFMargin?: number;
  grossMargin?: number;
  netMargin?: number;
  operatingIncomeGrowth?: number;
  netIncomeGrowth?: number;
  operatingCFGrowth?: number;
  cashRatio?: number;
  equityAmount?: number;
  cashAndDeposits?: number;
  totalAssetTurnover?: number;
  operatingCFNegative?: boolean;
  operatingLoss?: boolean;
  consecutiveOperatingLoss?: boolean;
  goingConcern?: boolean;
  msWarrant?: boolean;
  auditorChanged?: boolean;
};

export type HistoryItem = {
  year?: string | number;
  revenue?: number;
  operatingIncome?: number;
  operatingCF?: number;
  netIncome?: number;
};

export type RiskFlag = {
  title?: string;
  description?: string;
  level?: string;
};

export type RankingCompany = {
  ticker: string;
  company_name: string;
  score: number;
  danger_score: number;
  risk_level: string;
  financials?: Financials | null;
  history?: HistoryItem[] | null;
  risk?: { flags?: RiskFlag[] } | null;
};

export type MetricTone = "green" | "cyan" | "yellow" | "red" | "slate";

export type RankingDefinition = {
  slug: string;
  category: RankingCategory;
  title: string;
  shortTitle: string;
  description: string;
  metricLabel: string;
  metricTone: MetricTone;
  direction: "asc" | "desc";
  getValue: (company: RankingCompany) => number | null;
  formatValue: (value: number) => string;
  include?: (company: RankingCompany) => boolean;
  comment: (company: RankingCompany, value: number) => string;
  guide: string;
  caution: string;
  relatedSlugs: string[];
  isPremium?: boolean;
};

export type RankedCompany = {
  company: RankingCompany;
  value: number;
  comment: string;
};
