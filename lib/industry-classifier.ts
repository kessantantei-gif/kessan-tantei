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

export type IndustryTheme =
  | "saas"
  | "ai"
  | "dx"
  | "fintech"
  | "security"
  | "cloud"
  | "semiconductor"
  | "bio"
  | "medical"
  | "game"
  | "ec"
  | "advertising"
  | "hr"
  | "education"
  | "real-estate-tech"
  | "robot"
  | "iot"
  | "space"
  | "defense"
  | "consumer"
  | "manufacturing"
  | "other";

const industryThemeKeywords: Record<Exclude<IndustryTheme, "other">, string[]> = {
  saas: ["SaaS", "サース", "クラウドサービス"],
  ai: ["AI", "人工知能", "ＡＩ"],
  dx: ["DX", "デジタル変革", "ＤＸ"],
  fintech: ["FinTech", "フィンテック", "決済", "金融"],
  security: ["セキュリティ", "Security", "サイバー"],
  cloud: ["クラウド", "Cloud"],
  semiconductor: ["半導体", "セミコンダクタ"],
  bio: ["バイオ", "創薬", "ペプチド"],
  medical: ["医療", "メディカル", "ヘルスケア", "クリニック"],
  game: ["ゲーム", "Game", "エンターテインメント"],
  ec: ["EC", "ＥＣ", "コマース", "通販"],
  advertising: ["広告", "マーケティング", "PR"],
  hr: ["人材", "HR", "採用", "キャリア"],
  education: ["教育", "学習", "スクール"],
  "real-estate-tech": ["不動産", "PropTech", "プロップテック"],
  robot: ["ロボット", "Robot", "ロボティクス"],
  iot: ["IoT", "ＩｏＴ", "モノのインターネット"],
  space: ["宇宙", "Space", "衛星"],
  defense: ["防衛", "Defense", "ドローン"],
  consumer: ["食品", "小売", "消費者", "レストラン", "アパレル"],
  manufacturing: ["製造", "工業", "機械", "電機"],
};

export function classifyIndustryThemes(companyName: string): IndustryTheme[] {
  const themes = Object.entries(industryThemeKeywords)
    .filter(([, keywords]) => keywords.some((keyword) => companyName.includes(keyword)))
    .map(([theme]) => theme as Exclude<IndustryTheme, "other">);

  return themes.length > 0 ? themes : ["other"];
}
