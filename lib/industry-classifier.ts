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
    "ＡＩ",
    "テック",
    "クラウド",
    "SaaS",
    "ＳａａＳ",
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

export const industryThemeLabels: Record<IndustryTheme, string> = {
  saas: "SaaS",
  ai: "AI・データ",
  dx: "DX・業務支援",
  fintech: "FinTech・金融",
  security: "セキュリティ",
  cloud: "クラウド",
  semiconductor: "半導体",
  bio: "バイオ・創薬",
  medical: "医療・ヘルスケア",
  game: "ゲーム・IP",
  ec: "EC・コマース",
  advertising: "広告・マーケティング",
  hr: "人材・採用",
  education: "教育・学習",
  "real-estate-tech": "不動産Tech",
  robot: "ロボティクス",
  iot: "IoT",
  space: "宇宙・衛星",
  defense: "防衛・ドローン",
  consumer: "消費者向け",
  manufacturing: "製造・機器",
  other: "その他",
};

export function industryThemeLabel(theme: IndustryTheme) {
  return industryThemeLabels[theme];
}

const industryThemeKeywords: Record<Exclude<IndustryTheme, "other">, string[]> = {
  saas: ["SaaS", "ＳａａＳ", "サース", "クラウドサービス", "サブスクリプション"],
  ai: ["AI", "ＡＩ", "人工知能", "機械学習", "ディープラーニング", "データ解析"],
  dx: ["DX", "ＤＸ", "デジタル変革", "業務効率化", "業務支援", "ITサービス"],
  fintech: ["FinTech", "フィンテック", "決済", "金融", "証券", "銀行", "保険"],
  security: ["セキュリティ", "Security", "サイバー", "認証", "不正検知"],
  cloud: ["クラウド", "Cloud", "データセンター", "ホスティング"],
  semiconductor: ["半導体", "セミコンダクタ", "ウェハ", "チップ", "LSI"],
  bio: ["バイオ", "創薬", "ペプチド", "医薬品", "治験"],
  medical: ["医療", "メディカル", "ヘルスケア", "クリニック", "病院", "介護"],
  game: ["ゲーム", "Game", "エンターテインメント", "VTuber", "ＶＴｕｂｅｒ", "アニメ", "IP"],
  ec: ["EC", "ＥＣ", "コマース", "通販", "マーケットプレイス"],
  advertising: ["広告", "マーケティング", "PR", "ＰＲ", "販促", "アドテク"],
  hr: ["人材", "HR", "採用", "求人", "キャリア", "派遣"],
  education: ["教育", "学習", "スクール", "EdTech", "研修"],
  "real-estate-tech": ["不動産", "PropTech", "プロップテック", "住宅", "建物管理"],
  robot: ["ロボット", "Robot", "ロボティクス", "自動化", "FA"],
  iot: ["IoT", "ＩｏＴ", "モノのインターネット", "センサー", "通信モジュール"],
  space: ["宇宙", "Space", "スペース", "衛星", "月面", "SAR", "軌道上", "デブリ"],
  defense: ["防衛", "Defense", "ドローン", "無人機", "安全保障"],
  consumer: ["食品", "小売", "消費者", "レストラン", "外食", "アパレル", "美容"],
  manufacturing: ["製造", "工業", "機械", "電機", "精密", "装置", "部品"],
};

export function classifyIndustryThemes(searchableText: string): IndustryTheme[] {
  const normalized = searchableText.normalize("NFKC");
  const themes = Object.entries(industryThemeKeywords)
    .filter(([, keywords]) =>
      keywords.some((keyword) => normalized.toLowerCase().includes(keyword.normalize("NFKC").toLowerCase()))
    )
    .map(([theme]) => theme as Exclude<IndustryTheme, "other">);

  return themes.length > 0 ? [...new Set(themes)] : ["other"];
}
