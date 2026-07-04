export type SignalLevel = "danger" | "warning" | "positive";

export type DetectiveSignal = {
  level: SignalLevel;
  title: string;
  description: string;
};

type SignalMetrics = {
  operatingCashFlows: number[];
  operatingIncomes: number[];
  cash: number;
  monthlyCashBurn: number;
  hasMsWarrant: boolean;
  equityFinancingCountLast3Years: number;
  auditorChanged: boolean;
  goingConcernNote: boolean;
  currentRatioTrend: "improving" | "stable" | "declining";
};

function isThreeConsecutiveNegative(values: number[]) {
  return values.slice(-3).every((value) => value < 0);
}

export function generateSignals(metrics: SignalMetrics): DetectiveSignal[] {
  const signals: DetectiveSignal[] = [];

  if (isThreeConsecutiveNegative(metrics.operatingCashFlows)) {
    signals.push({
      level: "danger",
      title: "営業CFが3期連続マイナス",
      description: "事業活動によるキャッシュ創出力に注意が必要です。",
    });
  }

  if (metrics.monthlyCashBurn > 0) {
    const runwayMonths = metrics.cash / metrics.monthlyCashBurn;

    if (runwayMonths < 12) {
      signals.push({
        level: "danger",
        title: "Cash Runway 12ヶ月未満",
        description: "追加資金調達リスクを確認すべき水準です。",
      });
    }
  }

  if (metrics.hasMsWarrant) {
    signals.push({
      level: "danger",
      title: "MSワラントあり",
      description: "株式価値の希薄化リスクが高い可能性があります。",
    });
  }

  if (metrics.equityFinancingCountLast3Years >= 2) {
    signals.push({
      level: "warning",
      title: "増資頻度が高い",
      description: "資金調達依存度や希薄化リスクを確認してください。",
    });
  }

  if (metrics.auditorChanged) {
    signals.push({
      level: "warning",
      title: "監査法人交代",
      description: "交代理由と監査上の論点を確認すべきです。",
    });
  }

  if (metrics.goingConcernNote) {
    signals.push({
      level: "danger",
      title: "継続企業の前提注記あり",
      description: "事業継続リスクが明示されています。",
    });
  }

  if (isThreeConsecutiveNegative(metrics.operatingIncomes)) {
    signals.push({
      level: "warning",
      title: "営業利益が3期連続マイナス",
      description: "黒字化までの道筋を確認すべきです。",
    });
  }

  if (metrics.currentRatioTrend === "declining") {
    signals.push({
      level: "warning",
      title: "流動比率が低下傾向",
      description: "短期的な支払余力の低下に注意が必要です。",
    });
  }

  if (signals.length === 0) {
    signals.push({
      level: "positive",
      title: "重大な危険シグナルなし",
      description: "現時点で主要な会計リスクは検出されていません。",
    });
  }

  return signals;
}