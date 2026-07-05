import { classifyIndustryThemes, type IndustryTheme } from "@/lib/industry-classifier";
import { hasRiskFlag, latestChange, revenueCagr3 } from "./engine";
import type {
  MetricTone,
  RankingCategory,
  RankingCompany,
  RankingDefinition,
} from "./types";

export const rankingCategories: {
  id: RankingCategory;
  title: string;
  icon: string;
  description: string;
}[] = [
  { id: "overall", title: "総合", icon: "📊", description: "複数の財務指標をまとめて企業を比較" },
  { id: "growth", title: "成長性", icon: "📈", description: "売上や利益が伸びている企業を比較" },
  { id: "profitability", title: "収益性", icon: "💹", description: "本業で利益を生み出す力を比較" },
  { id: "cash", title: "キャッシュ", icon: "💵", description: "現金を生み出す力と手元資金を比較" },
  { id: "safety", title: "安全性", icon: "🛡️", description: "財務の安定度を比較" },
  { id: "risk", title: "リスク", icon: "🔎", description: "注意して確認したい財務シグナルを比較" },
  { id: "industry", title: "業種・領域別", icon: "🏢", description: "事業領域が近い企業同士で比較" },
  { id: "theme", title: "テーマ別", icon: "🧭", description: "決算の特徴や変化から企業を比較" },
];

const number = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const percent = (value: number) => `${number.format(value)}%`;
const points = (value: number) => `${number.format(value)}点`;
const multiple = (value: number) => `${number.format(value)}倍`;
const yenOku = (value: number) => `${number.format(value / 100_000_000)}億円`;

const f = (company: RankingCompany, key: keyof NonNullable<RankingCompany["financials"]>) => {
  const value = company.financials?.[key];
  return typeof value === "number" ? value : null;
};

const ratio = (numerator: number | null, denominator: number | null) =>
  numerator !== null && denominator !== null && denominator !== 0
    ? (numerator / denominator) * 100
    : null;

const positive = (value: number | null) => value !== null && value > 0;
const commonCaution = "順位は取得できた最新の決算データに基づきます。決算期や業種の違いにも注意してください。";

type DefinitionInput = Omit<RankingDefinition, "guide" | "caution" | "relatedSlugs"> & {
  guide?: string;
  caution?: string;
  relatedSlugs?: string[];
};

function define(input: DefinitionInput): RankingDefinition {
  return {
    ...input,
    guide: input.guide ?? `${input.metricLabel}の数値と企業間の差を確認し、ほかの指標もあわせて見ましょう。`,
    caution: input.caution ?? commonCaution,
    relatedSlugs: input.relatedSlugs ?? [],
  };
}

function metricDefinition(input: {
  slug: string;
  category: RankingCategory;
  title: string;
  shortTitle?: string;
  description: string;
  metricLabel: string;
  metricTone?: MetricTone;
  getValue: RankingDefinition["getValue"];
  formatValue?: RankingDefinition["formatValue"];
  direction?: RankingDefinition["direction"];
  include?: RankingDefinition["include"];
  comment?: RankingDefinition["comment"];
  guide?: string;
  caution?: string;
  relatedSlugs?: string[];
}) {
  return define({
    ...input,
    shortTitle: input.shortTitle ?? input.title.replace("ランキング", ""),
    metricTone: input.metricTone ?? "green",
    direction: input.direction ?? "desc",
    formatValue: input.formatValue ?? percent,
    comment:
      input.comment ??
      ((_company, value) => `${input.metricLabel}は${(input.formatValue ?? percent)(value)}です。`),
  });
}

const operatingMargin = (company: RankingCompany) =>
  f(company, "operatingMargin");
const ocfMargin = (company: RankingCompany) =>
  f(company, "operatingCFMargin") ?? f(company, "ocfMargin");
const equityRatio = (company: RankingCompany) =>
  f(company, "equityRatio");
const cashCoverage = (company: RankingCompany) => {
  const cashRatio = f(company, "cashRatio");
  return cashRatio === null ? null : cashRatio / 100;
};
const rule40 = (company: RankingCompany) => {
  const growth = f(company, "revenueGrowth");
  const margin = operatingMargin(company);
  return growth !== null && margin !== null ? growth + margin : null;
};
const grossMargin = (company: RankingCompany) => f(company, "grossMargin");
const assetTurnover = (company: RankingCompany) => f(company, "totalAssetTurnover");
const safetyScore = (company: RankingCompany) => {
  const equity = equityRatio(company);
  const coverage = cashCoverage(company);
  if (equity === null || coverage === null) return null;
  return Math.max(0, Math.min(100, equity * 0.7 + Math.min(coverage * 100, 100) * 0.3));
};
const historyValues = (company: RankingCompany, key: "revenue" | "operatingIncome" | "operatingCF") =>
  (company.history ?? []).map((item) => item[key]).filter((value): value is number => typeof value === "number");
const isProfitable = (company: RankingCompany) => (f(company, "operatingIncome") ?? 0) > 0;
const isHighGrowth = (company: RankingCompany) => (f(company, "revenueGrowth") ?? -Infinity) >= 20;

const definitions: RankingDefinition[] = [
  metricDefinition({ slug: "score", category: "overall", title: "財務スコアランキング", description: "成長性・収益性・安全性をまとめた財務スコアで比較します。", metricLabel: "財務スコア", getValue: (c) => c.score, formatValue: points, comment: (_c, v) => `複数の財務指標をまとめたスコアは${points(v)}です。`, relatedSlugs: ["s-rank", "safe-companies", "revenue-growth"] }),
  metricDefinition({ slug: "s-rank", category: "overall", title: "Sランク企業ランキング", description: "財務スコア85点以上かつリスクスコア25点以下の企業です。", metricLabel: "財務スコア", getValue: (c) => c.score, formatValue: points, include: (c) => c.score >= 85 && c.danger_score <= 25, comment: () => "成長・収益・安全性のバランスが特に高い水準です。", relatedSlugs: ["score", "a-rank", "safe-companies"] }),
  metricDefinition({ slug: "a-rank", category: "overall", title: "Aランク企業ランキング", description: "財務スコア70点以上85点未満の企業を比較します。", metricLabel: "財務スコア", getValue: (c) => c.score, formatValue: points, include: (c) => c.score >= 70 && c.score < 85, relatedSlugs: ["score", "s-rank"] }),
  metricDefinition({ slug: "safe-companies", category: "overall", title: "SAFE企業ランキング", description: "リスク判定がSAFEの企業を財務スコア順に比較します。", metricLabel: "財務スコア", getValue: (c) => c.score, formatValue: points, include: (c) => c.risk_level === "SAFE", comment: () => "現時点の決算データでは強い注意シグナルが限定的です。", relatedSlugs: ["safety-score", "risk-signal"] }),
  metricDefinition({ slug: "featured-companies", category: "overall", title: "注目企業ランキング", description: "売上成長率が20%以上の企業を財務スコア順に比較します。", metricLabel: "財務スコア", getValue: (c) => c.score, formatValue: points, include: isHighGrowth, relatedSlugs: ["high-growth", "profitable-high-growth"] }),
  metricDefinition({ slug: "recommended", category: "overall", title: "決算探偵おすすめランキング", description: "高成長・営業黒字・低リスクを満たす企業を機械的な条件で比較します。", metricLabel: "財務スコア", getValue: (c) => c.score, formatValue: points, include: (c) => isHighGrowth(c) && isProfitable(c) && c.danger_score <= 25, comment: () => "高成長・営業黒字・低リスクの3条件を満たしています。", caution: "機械的な抽出であり、銘柄の推奨や将来の業績を保証するものではありません。", relatedSlugs: ["profitable-high-growth", "safe-companies"] }),

  metricDefinition({ slug: "revenue-growth", category: "growth", title: "売上成長率ランキング", description: "前期から売上高がどれだけ伸びたかを比較します。", metricLabel: "売上成長率", getValue: (c) => f(c, "revenueGrowth"), relatedSlugs: ["revenue-cagr-3y", "profitable-high-growth", "rule-of-40"] }),
  metricDefinition({ slug: "revenue", category: "growth", title: "売上高ランキング", description: "直近決算の売上規模を比較します。", metricLabel: "売上高", getValue: (c) => f(c, "revenue"), formatValue: yenOku, relatedSlugs: ["revenue-growth", "asset-turnover"] }),
  metricDefinition({ slug: "revenue-cagr-3y", category: "growth", title: "売上3年CAGRランキング", description: "売上高の年平均成長率を最大3期間の履歴から比較します。", metricLabel: "売上CAGR", getValue: revenueCagr3, caution: "3期以上の売上履歴が取得できた企業のみを対象とします。", relatedSlugs: ["revenue-growth", "high-growth"] }),
  metricDefinition({ slug: "gross-profit-growth", category: "growth", title: "売上総利益成長率ランキング", description: "商品・サービスから得た粗利益の伸び率を比較します。", metricLabel: "粗利益成長率", getValue: (c) => f(c, "grossProfitGrowth"), relatedSlugs: ["gross-margin", "revenue-growth"] }),
  metricDefinition({ slug: "operating-income-growth", category: "growth", title: "営業利益成長率ランキング", description: "本業の利益が前期からどれだけ伸びたかを比較します。", metricLabel: "営業利益成長率", getValue: (c) => f(c, "operatingIncomeGrowth"), caution: "当期と前期の営業利益を取得できた企業のみを対象とします。", relatedSlugs: ["operating-margin", "profit-turnaround"] }),
  metricDefinition({ slug: "net-income-growth", category: "growth", title: "純利益成長率ランキング", description: "最終的な利益が前期からどれだけ伸びたかを比較します。", metricLabel: "純利益成長率", getValue: (c) => f(c, "netIncomeGrowth"), caution: "当期と前期の純利益を取得できた企業のみを対象とします。", relatedSlugs: ["net-margin", "operating-income-growth"] }),
  metricDefinition({ slug: "rule-of-40", category: "growth", title: "Rule of 40ランキング", description: "売上成長率と営業利益率の合計で、成長と収益のバランスを比較します。", metricLabel: "Rule of 40", getValue: rule40, formatValue: points, comment: (_c, v) => `${points(v)}で、成長率と利益率を合計した水準です。`, relatedSlugs: ["revenue-growth", "operating-margin", "rule40-excellent"] }),
  metricDefinition({ slug: "high-growth", category: "growth", title: "高成長企業ランキング", description: "売上成長率20%以上の企業を成長率順に比較します。", metricLabel: "売上成長率", getValue: (c) => f(c, "revenueGrowth"), include: isHighGrowth, relatedSlugs: ["revenue-growth", "profitable-high-growth"] }),
  metricDefinition({ slug: "profitable-high-growth", category: "growth", title: "黒字高成長企業ランキング", description: "売上成長率20%以上かつ営業黒字の企業を比較します。", metricLabel: "売上成長率", getValue: (c) => f(c, "revenueGrowth"), include: (c) => isHighGrowth(c) && isProfitable(c), comment: () => "売上が高成長で、本業も黒字です。", relatedSlugs: ["high-growth", "operating-margin"] }),

  metricDefinition({ slug: "operating-margin", category: "profitability", title: "営業利益率ランキング", description: "売上高に対して本業の利益をどれだけ残せたかを比較します。", metricLabel: "営業利益率", getValue: operatingMargin, relatedSlugs: ["gross-margin", "ocf-margin", "rule-of-40"] }),
  metricDefinition({ slug: "operating-income", category: "profitability", title: "営業利益ランキング", description: "直近決算における本業の利益額を比較します。", metricLabel: "営業利益", getValue: (c) => f(c, "operatingIncome"), formatValue: yenOku, relatedSlugs: ["operating-margin", "operating-income-growth"] }),
  metricDefinition({ slug: "gross-margin", category: "profitability", title: "売上総利益率ランキング", description: "売上高から原価を引いた粗利益の割合を比較します。", metricLabel: "売上総利益率", getValue: grossMargin, relatedSlugs: ["gross-profit-growth", "operating-margin"] }),
  metricDefinition({ slug: "net-margin", category: "profitability", title: "純利益率ランキング", description: "売上高に対して最終的な利益をどれだけ残せたかを比較します。", metricLabel: "純利益率", getValue: (c) => f(c, "netMargin"), relatedSlugs: ["operating-margin", "net-income-growth"] }),
  metricDefinition({ slug: "asset-turnover", category: "profitability", title: "資産回転率ランキング", description: "保有する資産をどれだけ効率よく売上につなげたかを比較します。", metricLabel: "資産回転率", getValue: assetTurnover, formatValue: multiple, relatedSlugs: ["operating-margin", "safety-score"] }),
  metricDefinition({ slug: "margin-improvement", category: "profitability", title: "利益率改善企業ランキング", description: "直近2期の営業利益率がどれだけ改善したかを比較します。", metricLabel: "利益率改善幅", getValue: (c) => { const h = c.history ?? []; if (h.length < 2) return null; const a = h.at(-2)!; const b = h.at(-1)!; const before = ratio(a.operatingIncome ?? null, a.revenue ?? null); const after = ratio(b.operatingIncome ?? null, b.revenue ?? null); return before !== null && after !== null ? after - before : null; }, include: (c) => (latestChange(c, "operatingIncome") ?? 0) > 0, formatValue: (v) => `${percent(v)}pt`, relatedSlugs: ["operating-income-growth", "profit-turnaround"] }),

  metricDefinition({ slug: "operating-cash-flow", category: "cash", title: "営業CFランキング", description: "本業の活動から生み出した現金の金額を比較します。", metricLabel: "営業CF", getValue: (c) => f(c, "operatingCF"), formatValue: yenOku, metricTone: "cyan", relatedSlugs: ["ocf-growth", "ocf-margin", "positive-ocf"] }),
  metricDefinition({ slug: "ocf-growth", category: "cash", title: "営業CF成長率ランキング", description: "営業CFが前期からどれだけ増えたかを比較します。", metricLabel: "営業CF成長率", getValue: (c) => f(c, "operatingCFGrowth"), metricTone: "cyan", relatedSlugs: ["operating-cash-flow", "ocf-improvement"] }),
  metricDefinition({ slug: "ocf-margin", category: "cash", title: "営業CFマージンランキング", description: "売上高に対して営業CFをどれだけ生み出したかを比較します。", metricLabel: "営業CFマージン", getValue: ocfMargin, metricTone: "cyan", relatedSlugs: ["operating-margin", "operating-cash-flow"] }),
  metricDefinition({ slug: "positive-ocf", category: "cash", title: "営業CF黒字企業ランキング", description: "営業CFがプラスの企業を金額順に比較します。", metricLabel: "営業CF", getValue: (c) => f(c, "operatingCF"), include: (c) => positive(f(c, "operatingCF")), formatValue: yenOku, metricTone: "cyan", comment: () => "本業の活動による現金収支がプラスです。", relatedSlugs: ["operating-cash-flow", "ocf-margin"] }),
  metricDefinition({ slug: "ocf-improvement", category: "cash", title: "営業CF改善企業ランキング", description: "営業CFの前期からの改善額を比較します。", metricLabel: "営業CF改善額", getValue: (c) => latestChange(c, "operatingCF"), include: (c) => (latestChange(c, "operatingCF") ?? 0) > 0, formatValue: yenOku, metricTone: "cyan", relatedSlugs: ["ocf-growth", "profit-turnaround"] }),
  metricDefinition({ slug: "cash", category: "cash", title: "現金保有額ランキング", description: "貸借対照表上の現金・預金の金額を比較します。", metricLabel: "現金保有額", getValue: (c) => f(c, "cash"), formatValue: yenOku, metricTone: "cyan", relatedSlugs: ["cash-rich", "cash-ratio"] }),
  metricDefinition({ slug: "cash-rich", category: "cash", title: "キャッシュリッチ企業ランキング", description: "現金が流動負債をどれだけカバーできるかを比較します。", metricLabel: "現金カバー倍率", getValue: cashCoverage, formatValue: multiple, metricTone: "cyan", relatedSlugs: ["cash", "cash-ratio", "safe-companies"] }),

  metricDefinition({ slug: "equity-ratio", category: "safety", title: "自己資本比率ランキング", description: "総資産に占める返済不要の自己資本の割合を比較します。", metricLabel: "自己資本比率", getValue: equityRatio, metricTone: "green", relatedSlugs: ["safety-score", "cash-ratio"] }),
  metricDefinition({ slug: "cash-ratio", category: "safety", title: "現金比率ランキング", description: "短期的な負債に対して現金をどれだけ持つかを比較します。", metricLabel: "現金比率", getValue: (c) => { const value = cashCoverage(c); return value === null ? null : value * 100; }, relatedSlugs: ["cash-rich", "equity-ratio"] }),
  metricDefinition({ slug: "safety-score", category: "safety", title: "安全性スコアランキング", description: "自己資本比率と現金による短期負債のカバー力を合成して比較します。", metricLabel: "安全性スコア", getValue: safetyScore, formatValue: points, comment: () => "自己資本と手元現金の2つの観点から算出しています。", relatedSlugs: ["equity-ratio", "cash-ratio", "safe-companies"] }),

  metricDefinition({ slug: "risk-signal", category: "risk", title: "リスクシグナルランキング", description: "決算データから注意して確認したい財務シグナルの強さを比較します。", metricLabel: "リスクスコア", getValue: (c) => c.danger_score, formatValue: points, metricTone: "red", comment: (_c, v) => `注意シグナルの合計スコアは${points(v)}です。`, caution: "リスクスコアが高いことだけで企業価値や将来性を判断するものではありません。", relatedSlugs: ["financial-deterioration", "operating-loss", "ocf-deterioration"] }),
  metricDefinition({ slug: "ocf-deterioration", category: "risk", title: "営業CF悪化ランキング", description: "営業CFが前期から減少した企業を悪化額で比較します。", metricLabel: "営業CF減少額", getValue: (c) => { const v = latestChange(c, "operatingCF"); return v !== null && v < 0 ? Math.abs(v) : null; }, formatValue: yenOku, metricTone: "red", relatedSlugs: ["risk-signal", "ocf-improvement"] }),
  metricDefinition({ slug: "operating-loss", category: "risk", title: "営業赤字企業ランキング", description: "本業の営業損益が赤字の企業を赤字額で比較します。", metricLabel: "営業赤字額", getValue: (c) => c.financials?.operatingLoss ? Math.abs(c.financials.operatingIncome ?? 0) : null, formatValue: yenOku, metricTone: "red", comment: () => "直近決算では本業の営業損益が赤字です。", relatedSlugs: ["continuing-loss", "loss-high-growth"] }),
  metricDefinition({ slug: "continuing-loss", category: "risk", title: "継続赤字企業ランキング", description: "営業赤字が2期以上続く企業を赤字額で比較します。", metricLabel: "営業赤字額", getValue: (c) => c.financials?.consecutiveOperatingLoss ? Math.abs(c.financials.operatingIncome ?? 0) : null, formatValue: yenOku, metricTone: "red", relatedSlugs: ["operating-loss", "risk-signal"] }),
  metricDefinition({ slug: "capital-increase-risk", category: "risk", title: "増資リスクランキング", description: "増資・希薄化に関するリスクシグナルが検出された企業を比較します。", metricLabel: "リスクスコア", getValue: (c) => hasRiskFlag(c, ["増資", "希薄化", "資金調達"]) ? c.danger_score : null, formatValue: points, metricTone: "red", relatedSlugs: ["ms-warrant", "risk-signal"] }),
  metricDefinition({ slug: "ms-warrant", category: "risk", title: "MSワラント注意企業ランキング", description: "MSワラントに関するシグナルが検出された企業を比較します。", metricLabel: "リスクスコア", getValue: (c) => c.financials?.msWarrant ? c.danger_score : null, formatValue: points, metricTone: "red", relatedSlugs: ["capital-increase-risk", "risk-signal"] }),
  metricDefinition({ slug: "auditor-change", category: "risk", title: "監査法人変更企業ランキング", description: "監査法人変更に関するシグナルが検出された企業を比較します。", metricLabel: "リスクスコア", getValue: (c) => c.financials?.auditorChanged ? c.danger_score : null, formatValue: points, metricTone: "red", relatedSlugs: ["going-concern", "risk-signal"] }),
  metricDefinition({ slug: "going-concern", category: "risk", title: "継続企業注記ランキング", description: "継続企業の前提に関する注記シグナルが検出された企業を比較します。", metricLabel: "リスクスコア", getValue: (c) => c.financials?.goingConcern ? c.danger_score : null, formatValue: points, metricTone: "red", relatedSlugs: ["auditor-change", "risk-signal"] }),
  metricDefinition({ slug: "financial-deterioration", category: "risk", title: "財務悪化企業ランキング", description: "営業赤字・営業CFマイナス・低い自己資本比率が重なる企業を比較します。", metricLabel: "悪化ポイント", getValue: (c) => { let v = 0; if ((f(c, "operatingIncome") ?? 0) < 0) v += 1; if ((f(c, "operatingCF") ?? 0) < 0) v += 1; if ((equityRatio(c) ?? 100) < 30) v += 1; return v >= 2 ? v : null; }, formatValue: (v) => `${v}項目`, metricTone: "red", comment: (_c, v) => `主要な注意項目が${v}つ重なっています。`, relatedSlugs: ["risk-signal", "operating-loss", "ocf-deterioration"] }),

  metricDefinition({ slug: "profit-turnaround", category: "theme", title: "黒字転換企業ランキング", description: "前期の営業赤字から直近で営業黒字へ転換した企業を比較します。", metricLabel: "営業利益", getValue: (c) => { const values = historyValues(c, "operatingIncome"); return values.length >= 2 && values.at(-2)! < 0 && values.at(-1)! > 0 ? values.at(-1)! : null; }, formatValue: yenOku, metricTone: "yellow", comment: () => "前期の営業赤字から直近で営業黒字へ転換しています。", relatedSlugs: ["operating-income-growth", "margin-improvement"] }),
  metricDefinition({ slug: "loss-high-growth", category: "theme", title: "赤字だが高成長企業ランキング", description: "営業赤字でも売上成長率20%以上の企業を比較します。", metricLabel: "売上成長率", getValue: (c) => f(c, "revenueGrowth"), include: (c) => isHighGrowth(c) && !isProfitable(c), metricTone: "yellow", comment: () => "売上は高成長ですが、本業はまだ営業赤字です。", relatedSlugs: ["high-growth", "operating-loss"] }),
  metricDefinition({ slug: "rule40-excellent", category: "theme", title: "Rule40優秀企業ランキング", description: "売上成長率と営業利益率の合計が40以上の企業を比較します。", metricLabel: "Rule of 40", getValue: rule40, include: (c) => (rule40(c) ?? -Infinity) >= 40, formatValue: points, relatedSlugs: ["rule-of-40", "profitable-high-growth"] }),
  metricDefinition({ slug: "safety-focused", category: "theme", title: "安全性重視ランキング", description: "自己資本比率50%以上かつ現金カバー倍率1倍以上の企業を比較します。", metricLabel: "安全性スコア", getValue: safetyScore, include: (c) => (equityRatio(c) ?? 0) >= 50 && (cashCoverage(c) ?? 0) >= 1, formatValue: points, relatedSlugs: ["safety-score", "cash-rich"] }),
  metricDefinition({ slug: "watch-companies", category: "theme", title: "要注意企業ランキング", description: "リスクスコアが高い企業を注意シグナル順に比較します。", metricLabel: "リスクスコア", getValue: (c) => c.danger_score, include: (c) => c.danger_score >= 30, formatValue: points, metricTone: "red", caution: "要注意という表示は投資判断ではなく、決算を詳しく確認するための入口です。", relatedSlugs: ["risk-signal", "financial-deterioration"] }),
];

const industryLabels: Record<IndustryTheme, string> = {
  saas: "SaaS", ai: "AI", dx: "DX", fintech: "FinTech", security: "Security",
  cloud: "Cloud", semiconductor: "半導体", bio: "Bio", medical: "医療", game: "Game",
  ec: "EC", advertising: "広告", hr: "人材", education: "教育",
  "real-estate-tech": "不動産Tech", robot: "Robot", iot: "IoT", space: "Space",
  defense: "Defense", consumer: "Consumer", manufacturing: "製造", other: "その他",
};

const industryDefinitions = (Object.entries(industryLabels) as [IndustryTheme, string][]).map(
  ([theme, label]) =>
    metricDefinition({
      slug: `industry-${theme}`,
      category: "industry",
      title: `${label}企業ランキング`,
      shortTitle: label,
      description: `${label}領域に分類された企業を財務スコアで比較します。`,
      metricLabel: "財務スコア",
      getValue: (company) => company.score,
      formatValue: points,
      include: (company) => classifyIndustryThemes(company.company_name).includes(theme),
      comment: () => `${label}領域として分類された企業です。`,
      caution: "企業名に含まれる事業キーワードによる自動分類です。実際の主力事業と異なる場合があります。",
      relatedSlugs: ["score", "revenue-growth"],
    })
);

export const rankingDefinitions = [...definitions, ...industryDefinitions];

const definitionMap = new Map(rankingDefinitions.map((definition) => [definition.slug, definition]));

export function getRankingDefinition(slug: string) {
  return definitionMap.get(slug);
}

export function getRankingsByCategory(category: RankingCategory) {
  return rankingDefinitions.filter((definition) => definition.category === category);
}

export function getRelatedRankings(definition: RankingDefinition) {
  const explicit = definition.relatedSlugs
    .map((slug) => definitionMap.get(slug))
    .filter((item): item is RankingDefinition => Boolean(item));

  if (explicit.length >= 3) return explicit.slice(0, 4);

  const sameCategory = rankingDefinitions.filter(
    (item) => item.category === definition.category && item.slug !== definition.slug
  );
  return [...new Map([...explicit, ...sameCategory].map((item) => [item.slug, item])).values()].slice(0, 4);
}
