import { classifyIndustryThemes, type IndustryTheme } from "@/lib/industry-classifier";
import {
  getCompanyMasterEntries,
  type CompanyMasterEntry,
} from "@/lib/company-master";
import { supabaseAdmin } from "@/lib/supabase";

type CompanyMasterRow = {
  ticker: string;
  company_name: string;
  theme: string;
  sub_theme: string;
  business_model: string | null;
  market_cap_class: string | null;
  rival_tickers: string[] | null;
  keywords: string[] | null;
  reviewed: boolean | null;
  updated_at: string | null;
};

export type RuntimeCompanyMasterEntry = CompanyMasterEntry & {
  updatedAt: string | null;
};

function inferThemeId(theme: string, subTheme: string, keywords: string[]): IndustryTheme {
  return (
    classifyIndustryThemes(`${theme} ${subTheme} ${keywords.join(" ")}`).find(
      (item) => item !== "other"
    ) ?? "other"
  );
}

function fromDatabaseRow(row: CompanyMasterRow): RuntimeCompanyMasterEntry {
  const keywords = row.keywords ?? [];

  return {
    ticker: row.ticker,
    companyName: row.company_name,
    theme: row.theme,
    themeId: inferThemeId(row.theme, row.sub_theme, keywords),
    subTheme: row.sub_theme,
    businessModel: row.business_model ?? "複合型・個別確認",
    marketCapClass: row.market_cap_class,
    rivalTickers: row.rival_tickers ?? [],
    keywords,
    reviewed: row.reviewed ?? true,
    source: "curated",
    updatedAt: row.updated_at,
  };
}

export async function loadRuntimeCompanyMasterEntries() {
  const automatic = getCompanyMasterEntries().map<RuntimeCompanyMasterEntry>((entry) => ({
    ...entry,
    updatedAt: null,
  }));

  const { data, error } = await supabaseAdmin
    .from("company_master")
    .select(
      "ticker, company_name, theme, sub_theme, business_model, market_cap_class, rival_tickers, keywords, reviewed, updated_at"
    )
    .limit(2000);

  if (error || !data) return automatic;

  const merged = new Map(automatic.map((entry) => [entry.ticker, entry]));
  for (const row of data as CompanyMasterRow[]) {
    merged.set(row.ticker, fromDatabaseRow(row));
  }

  return [...merged.values()].sort((a, b) => a.ticker.localeCompare(b.ticker, "ja"));
}

export async function loadRuntimeCompanyMasterMap() {
  const entries = await loadRuntimeCompanyMasterEntries();
  return new Map(entries.map((entry) => [entry.ticker, entry]));
}

export function getRuntimeSameThemeTickers(
  entries: RuntimeCompanyMasterEntry[],
  ticker: string
) {
  const target = entries.find((entry) => entry.ticker === ticker);
  if (!target) return [];

  return entries
    .filter((entry) => entry.ticker !== ticker && entry.themeId === target.themeId)
    .map((entry) => entry.ticker);
}

export function getRuntimeSameSubThemeTickers(
  entries: RuntimeCompanyMasterEntry[],
  ticker: string
) {
  const target = entries.find((entry) => entry.ticker === ticker);
  if (!target) return [];

  return entries
    .filter(
      (entry) =>
        entry.ticker !== ticker &&
        entry.themeId === target.themeId &&
        entry.subTheme === target.subTheme
    )
    .map((entry) => entry.ticker);
}
