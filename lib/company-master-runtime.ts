import { unstable_cache } from "next/cache";
import {
  classifyIndustryThemes,
  industryThemeLabel,
  type IndustryTheme,
} from "@/lib/industry-classifier";
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

type AllMarketCompanyRow = {
  ticker: string;
  company_name: string;
  market_segment: string;
  industry_name: string | null;
  listing_status: string;
};

export type RuntimeCompanyMasterEntry = CompanyMasterEntry & {
  updatedAt: string | null;
  marketSegment: string | null;
  industryName: string | null;
};

function inferThemeId(theme: string, subTheme: string, keywords: string[]): IndustryTheme {
  return (
    classifyIndustryThemes(`${theme} ${subTheme} ${keywords.join(" ")}`).find(
      (item) => item !== "other"
    ) ?? "other"
  );
}

function sectorFallbackTheme(industryName: string | null): IndustryTheme {
  const sector = industryName ?? "";

  if (/医薬品/.test(sector)) return "bio";
  if (/情報・通信業/.test(sector)) return "dx";
  if (/銀行業|証券、商品先物取引業|保険業|その他金融業/.test(sector)) {
    return "fintech";
  }
  if (/不動産業/.test(sector)) return "real-estate-tech";
  if (/電気機器|機械|精密機器|輸送用機器|金属製品|鉄鋼|非鉄金属|化学|ガラス・土石製品/.test(sector)) {
    return "manufacturing";
  }
  if (/小売業|食料品|繊維製品|水産・農林業|陸運業|空運業/.test(sector)) {
    return "consumer";
  }
  if (/サービス業/.test(sector)) return "dx";

  return "other";
}

function inferBusinessModel(text: string, theme: IndustryTheme) {
  if (/SaaS|クラウド|サブスク|定額/i.test(text)) return "ストック型・クラウドサービス";
  if (/広告|マーケティング|メディア/.test(text)) return "広告・マーケティング支援";
  if (/創薬|バイオ|医薬/.test(text)) return "研究開発・ライセンス";
  if (/小売|通販|EC|コマース/.test(text)) return "物販・EC";
  if (/人材|採用|求人|キャリア/.test(text)) return "人材マッチング・支援";
  if (/宇宙|衛星/.test(text)) return "宇宙インフラ・データサービス";
  if (/銀行|証券|保険|金融/.test(text)) return "金融サービス";
  if (/不動産/.test(text)) return "不動産・資産運用";
  if (theme === "manufacturing") return "製造・機器販売";
  if (theme === "consumer") return "消費者向けサービス";

  return "複合型・個別確認";
}

function fromAllMarketRow(row: AllMarketCompanyRow): RuntimeCompanyMasterEntry {
  const text = `${row.company_name} ${row.industry_name ?? ""}`;
  const detected = classifyIndustryThemes(text).filter((theme) => theme !== "other");
  const themeId = detected[0] ?? sectorFallbackTheme(row.industry_name);

  return {
    ticker: row.ticker,
    companyName: row.company_name,
    theme: industryThemeLabel(themeId),
    themeId,
    subTheme:
      themeId === "other"
        ? row.industry_name || "その他"
        : `${industryThemeLabel(themeId)}関連`,
    businessModel: inferBusinessModel(text, themeId),
    marketCapClass: null,
    rivalTickers: [],
    keywords: [row.industry_name, ...detected.map(industryThemeLabel)].filter(
      (value): value is string => Boolean(value)
    ),
    reviewed: false,
    source: "automatic",
    updatedAt: null,
    marketSegment: row.market_segment,
    industryName: row.industry_name,
  };
}

function fromStaticEntry(entry: CompanyMasterEntry): RuntimeCompanyMasterEntry {
  return {
    ...entry,
    updatedAt: null,
    marketSegment: "growth",
    industryName: null,
  };
}

function fromDatabaseRow(
  row: CompanyMasterRow,
  fallback?: RuntimeCompanyMasterEntry
): RuntimeCompanyMasterEntry {
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
    marketSegment: fallback?.marketSegment ?? null,
    industryName: fallback?.industryName ?? null,
  };
}

async function loadAllMarketCompanies() {
  const rows: AllMarketCompanyRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, market_segment, industry_name, listing_status")
      .eq("listing_status", "listed")
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return null;
    rows.push(...((data ?? []) as AllMarketCompanyRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function loadCuratedRows() {
  const rows: CompanyMasterRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("company_master")
      .select(
        "ticker, company_name, theme, sub_theme, business_model, market_cap_class, rival_tickers, keywords, reviewed, updated_at"
      )
      .order("ticker", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return null;
    rows.push(...((data ?? []) as CompanyMasterRow[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function loadRuntimeCompanyMasterEntriesUncached() {
  const [allMarketCompanies, curatedRows] = await Promise.all([
    loadAllMarketCompanies(),
    loadCuratedRows(),
  ]);

  const automatic =
    allMarketCompanies && allMarketCompanies.length > 0
      ? allMarketCompanies.map(fromAllMarketRow)
      : getCompanyMasterEntries().map(fromStaticEntry);

  const merged = new Map(automatic.map((entry) => [entry.ticker, entry]));
  for (const row of curatedRows ?? []) {
    merged.set(row.ticker, fromDatabaseRow(row, merged.get(row.ticker)));
  }

  return [...merged.values()].sort((a, b) => a.ticker.localeCompare(b.ticker, "ja"));
}

const loadRuntimeCompanyMasterEntriesCached = unstable_cache(
  loadRuntimeCompanyMasterEntriesUncached,
  ["runtime-company-master-entries-v2"],
  { revalidate: 3600 }
);

export async function loadRuntimeCompanyMasterEntries() {
  return loadRuntimeCompanyMasterEntriesCached();
}

async function loadRuntimeCompanyMasterEntryUncached(
  ticker: string
): Promise<RuntimeCompanyMasterEntry | null> {
  const [marketResult, curatedResult] = await Promise.all([
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, market_segment, industry_name, listing_status")
      .eq("ticker", ticker)
      .eq("listing_status", "listed")
      .maybeSingle(),
    supabaseAdmin
      .from("company_master")
      .select(
        "ticker, company_name, theme, sub_theme, business_model, market_cap_class, rival_tickers, keywords, reviewed, updated_at"
      )
      .eq("ticker", ticker)
      .maybeSingle(),
  ]);

  const marketRow = marketResult.data as AllMarketCompanyRow | null;
  const staticEntry = getCompanyMasterEntries().find((entry) => entry.ticker === ticker);
  const fallback = marketRow
    ? fromAllMarketRow(marketRow)
    : staticEntry
      ? fromStaticEntry(staticEntry)
      : null;

  const curatedRow = curatedResult.data as CompanyMasterRow | null;
  if (curatedRow) return fromDatabaseRow(curatedRow, fallback ?? undefined);
  return fallback;
}

const loadRuntimeCompanyMasterEntryCached = unstable_cache(
  loadRuntimeCompanyMasterEntryUncached,
  ["runtime-company-master-entry-v2"],
  { revalidate: 3600 }
);

export async function loadRuntimeCompanyMasterEntry(ticker: string) {
  return loadRuntimeCompanyMasterEntryCached(ticker);
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
