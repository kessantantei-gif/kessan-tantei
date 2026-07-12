import curatedCompanyMasterJson from "@/data/company-master.json";
import growthCompaniesJson from "@/data/growth-companies.json";
import { classifyIndustryThemes, industryThemeLabel, type IndustryTheme } from "@/lib/industry-classifier";

export type CompanyMasterEntry = {
  ticker: string;
  companyName: string;
  theme: string;
  themeId: IndustryTheme;
  subTheme: string;
  businessModel: string;
  marketCapClass: string | null;
  rivalTickers: string[];
  keywords: string[];
  reviewed: boolean;
  source: "curated" | "automatic";
};

type GrowthCompany = {
  ticker: string;
  name: string;
  market?: string;
  sector33?: string;
  sector17?: string;
  edinetHint?: string;
  edinetFilerName?: string;
};

type CuratedEntry = Omit<CompanyMasterEntry, "themeId" | "source"> & {
  themeId?: IndustryTheme;
};

const growthCompanies = growthCompaniesJson as GrowthCompany[];
const curatedEntries = curatedCompanyMasterJson as CuratedEntry[];

function normalizeText(company: GrowthCompany) {
  return [
    company.name,
    company.edinetHint,
    company.edinetFilerName,
    company.sector33,
    company.sector17,
  ]
    .filter(Boolean)
    .join(" ");
}

function sectorFallbackTheme(company: GrowthCompany): IndustryTheme {
  const sector = `${company.sector33 ?? ""} ${company.sector17 ?? ""}`;

  if (/医薬品/.test(sector)) return "bio";
  if (/電気機器|機械|精密機器|輸送用機器/.test(sector)) return "manufacturing";
  if (/小売|食料品|繊維製品/.test(sector)) return "consumer";
  if (/不動産/.test(sector)) return "real-estate-tech";
  if (/銀行|証券|保険|その他金融/.test(sector)) return "fintech";
  if (/情報・通信/.test(sector)) return "dx";
  if (/サービス/.test(sector)) return "other";

  return "other";
}

function inferSubTheme(company: GrowthCompany, theme: IndustryTheme) {
  if (theme !== "other") return `${industryThemeLabel(theme)}関連`;
  return company.sector33 || company.sector17 || "その他サービス";
}

function inferBusinessModel(company: GrowthCompany, theme: IndustryTheme) {
  const text = normalizeText(company);

  if (/SaaS|クラウド|サブスク|定額/.test(text)) return "ストック型・クラウドサービス";
  if (/広告|マーケティング|メディア/.test(text)) return "広告・マーケティング支援";
  if (/創薬|バイオ|医薬/.test(text)) return "研究開発・ライセンス";
  if (/小売|通販|EC|コマース/.test(text)) return "物販・EC";
  if (/人材|採用|求人|キャリア/.test(text)) return "人材マッチング・支援";
  if (/宇宙|衛星/.test(text)) return "宇宙インフラ・データサービス";
  if (theme === "manufacturing") return "製造・機器販売";
  if (theme === "consumer") return "消費者向けサービス";

  return "複合型・個別確認";
}

function automaticEntry(company: GrowthCompany): CompanyMasterEntry {
  const text = normalizeText(company);
  const detected = classifyIndustryThemes(text).filter((theme) => theme !== "other");
  const themeId = detected[0] ?? sectorFallbackTheme(company);

  return {
    ticker: company.ticker,
    companyName: company.name,
    theme: industryThemeLabel(themeId),
    themeId,
    subTheme: inferSubTheme(company, themeId),
    businessModel: inferBusinessModel(company, themeId),
    marketCapClass: null,
    rivalTickers: [],
    keywords: detected.map(industryThemeLabel),
    reviewed: false,
    source: "automatic",
  };
}

function resolveCuratedThemeId(entry: CuratedEntry): IndustryTheme {
  if (entry.themeId) return entry.themeId;
  const inferred = classifyIndustryThemes(`${entry.theme} ${entry.subTheme} ${entry.keywords.join(" ")}`);
  return inferred.find((theme) => theme !== "other") ?? "other";
}

const automaticEntries = growthCompanies.map(automaticEntry);
const curatedMap = new Map(
  curatedEntries.map((entry) => [
    entry.ticker,
    {
      ...entry,
      themeId: resolveCuratedThemeId(entry),
      source: "curated" as const,
    },
  ])
);

const companyMaster: CompanyMasterEntry[] = automaticEntries.map(
  (entry) => curatedMap.get(entry.ticker) ?? entry
);

for (const curated of curatedMap.values()) {
  if (!companyMaster.some((entry) => entry.ticker === curated.ticker)) {
    companyMaster.push(curated);
  }
}

const companyMasterMap = new Map(companyMaster.map((entry) => [entry.ticker, entry]));

export function getCompanyMaster(ticker: string) {
  return companyMasterMap.get(ticker) ?? null;
}

export function getCompanyMasterEntries() {
  return companyMaster;
}

export function getCompanyMasterCoverage() {
  const reviewed = companyMaster.filter((entry) => entry.reviewed).length;
  const automatic = companyMaster.length - reviewed;
  return {
    total: companyMaster.length,
    reviewed,
    automatic,
    coverageRate: growthCompanies.length === 0 ? 0 : companyMaster.length / growthCompanies.length,
  };
}

export function getSameThemeTickers(ticker: string) {
  const target = getCompanyMaster(ticker);
  if (!target) return [];

  return companyMaster
    .filter((entry) => entry.ticker !== ticker && entry.themeId === target.themeId)
    .map((entry) => entry.ticker);
}

export function getSameSubThemeTickers(ticker: string) {
  const target = getCompanyMaster(ticker);
  if (!target) return [];

  return companyMaster
    .filter(
      (entry) =>
        entry.ticker !== ticker &&
        entry.themeId === target.themeId &&
        entry.subTheme === target.subTheme
    )
    .map((entry) => entry.ticker);
}
