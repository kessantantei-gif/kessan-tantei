export type IndustryType =
  | "normal"
  | "finance"
  | "biotech"
  | "startup";

export function classifyIndustry(companyName: string): IndustryType {
  const financeKeywords = [
    "証券",
    "銀行",
    "信託",
    "保険",
    "リース",
    "フィナンシャル",
    "ファイナンス",
  ];

  if (financeKeywords.some((keyword) => companyName.includes(keyword))) {
    return "finance";
  }

  const biotechKeywords = [
    "バイオ",
    "創薬",
    "メディシノバ",
    "ペプチド",
  ];

  if (biotechKeywords.some((keyword) => companyName.includes(keyword))) {
    return "biotech";
  }

  const startupKeywords = [
    "AI",
    "テック",
    "クラウド",
    "SaaS",
  ];

  if (startupKeywords.some((keyword) => companyName.includes(keyword))) {
    return "startup";
  }

  return "normal";
}