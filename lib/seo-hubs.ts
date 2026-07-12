import {
  industryThemeLabels,
  type IndustryTheme,
} from "@/lib/industry-classifier";

export const seoThemeIds = Object.keys(industryThemeLabels).filter(
  (theme): theme is IndustryTheme => theme !== "other"
);

export const seoThemeDescriptions: Record<IndustryTheme, string> = {
  saas: "継続課金型のSaaS企業を、売上成長率・営業利益率・営業CF・財務安全性から比較します。",
  ai: "AI・データ活用を主力とするグロース企業を、成長性と収益化の進捗から比較します。",
  dx: "企業のDXや業務効率化を支援する会社を、成長率・利益率・キャッシュ創出力から比較します。",
  fintech: "決済・金融・証券・保険などFinTech領域の企業を、成長性と財務安全性から比較します。",
  security: "サイバーセキュリティや認証関連企業を、売上成長と収益性から比較します。",
  cloud: "クラウドサービスやデータ基盤関連企業を、成長性・継続収益・営業CFから比較します。",
  semiconductor: "半導体・製造装置・関連部品企業を、収益性・成長性・景気感応度から比較します。",
  bio: "バイオ・創薬企業を、研究開発負担・現金余力・資金調達リスクから比較します。",
  medical: "医療・ヘルスケア企業を、成長性・利益率・キャッシュ創出力から比較します。",
  game: "ゲーム・アニメ・IP関連企業を、売上成長・利益率・コンテンツ収益の安定性から比較します。",
  ec: "EC・コマース関連企業を、流通成長・利益率・資産効率から比較します。",
  advertising: "広告・マーケティング企業を、売上成長・粗利率・営業CFから比較します。",
  hr: "人材・採用・求人関連企業を、成長性・利益率・景気変動への耐性から比較します。",
  education: "教育・学習・研修関連企業を、成長率・継続収益・収益性から比較します。",
  "real-estate-tech": "不動産Tech企業を、成長性・収益性・資産負担から比較します。",
  robot: "ロボティクス・自動化関連企業を、売上成長・研究開発負担・財務余力から比較します。",
  iot: "IoT・センサー・通信モジュール関連企業を、成長性・利益率・営業CFから比較します。",
  space: "宇宙・衛星関連企業を、売上成長・赤字負担・現金余力・資金調達リスクから比較します。",
  defense: "防衛・ドローン関連企業を、受注成長・収益性・財務安全性から比較します。",
  consumer: "消費者向けサービス企業を、売上成長・利益率・キャッシュ創出力から比較します。",
  manufacturing: "製造・機器関連企業を、利益率・資産効率・営業CF・財務安全性から比較します。",
  other: "複数領域にまたがる企業を、主要な財務指標から比較します。",
};

export const featureHubs = [
  {
    slug: "profitable-high-growth",
    title: "黒字高成長企業",
    description: "売上成長率20%以上かつ営業黒字の企業を比較します。",
  },
  {
    slug: "high-growth",
    title: "高成長企業",
    description: "売上成長率20%以上のグロース企業を比較します。",
  },
  {
    slug: "operating-cash-flow",
    title: "営業CFが強い企業",
    description: "本業から生み出した営業キャッシュフローを比較します。",
  },
  {
    slug: "operating-margin-improvement",
    title: "利益率改善企業",
    description: "営業利益率が前期から改善した企業を比較します。",
  },
  {
    slug: "operating-cf-improvement",
    title: "営業CF改善企業",
    description: "営業キャッシュフローが前期から改善した企業を比較します。",
  },
  {
    slug: "rule-of-40",
    title: "Rule of 40企業",
    description: "売上成長率と営業利益率の合計で成長と収益性を比較します。",
  },
  {
    slug: "loss-making-growth",
    title: "赤字成長企業",
    description: "売上は伸びている一方で営業赤字の企業を確認します。",
  },
  {
    slug: "risk-signal",
    title: "リスクシグナル企業",
    description: "資金繰り・赤字・希薄化などの注意シグナルを比較します。",
  },
] as const;
