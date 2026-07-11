import companyMasterJson from "@/data/company-master.json";

export type CompanyMasterEntry = {
  ticker: string;
  companyName: string;
  theme: string;
  subTheme: string;
  businessModel: string;
  marketCapClass: string | null;
  rivalTickers: string[];
  keywords: string[];
  reviewed: boolean;
};

const companyMaster = companyMasterJson as CompanyMasterEntry[];
const companyMasterMap = new Map(companyMaster.map((entry) => [entry.ticker, entry]));

export function getCompanyMaster(ticker: string) {
  return companyMasterMap.get(ticker) ?? null;
}

export function getCompanyMasterEntries() {
  return companyMaster;
}

export function getSameThemeTickers(ticker: string) {
  const target = getCompanyMaster(ticker);
  if (!target) return [];

  return companyMaster
    .filter((entry) => entry.ticker !== ticker && entry.theme === target.theme)
    .map((entry) => entry.ticker);
}

export function getSameSubThemeTickers(ticker: string) {
  const target = getCompanyMaster(ticker);
  if (!target) return [];

  return companyMaster
    .filter((entry) => entry.ticker !== ticker && entry.subTheme === target.subTheme)
    .map((entry) => entry.ticker);
}
