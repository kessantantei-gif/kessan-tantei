export type SignalLevel = "danger" | "warning" | "positive";

export type DetectiveSignal = {
  level: SignalLevel;
  title: string;
  description: string;
};

type SignalMetrics = {
  operatingCashFlows: number[];
  operatingIncomes: number[];
  cash?: number;
  monthlyCashBurn?: number;
  hasMsWarrant: boolean;
  equityFinancingCountLast3Years: number;
  auditorChanged: boolean;
  goingConcernNote: boolean;
  currentRatioTrend: "improving" | "stable" | "declining";
};

function isThreeConsecutiveNegative(values: number[]) {
  return values.length >= 3 && values.slice(-3).every((value) => value < 0);
}

export function generateSignals(metrics: SignalMetrics): DetectiveSignal[] {
  const signals: DetectiveSignal[] = [];

  if (isThreeConsecutiveNegative(metrics.operatingCashFlows)) {
    signals.push({
      level: "danger",
      title: "営業CF 3期連続マイナス",
      description: "判定根拠：直近3期の営業CFがすべてマイナス",
    });
  }

  if (
    metrics.monthlyCashBurn !== undefined &&
    metrics.monthlyCashBurn > 0 &&
    metrics.cash !== undefined
  ) {
    const runwayMonths = metrics.cash / metrics.monthlyCashBurn;

    if (runwayMonths < 12) {
      signals.push({
        level: "danger",
        title: "Cash Runway 12ヶ月未満",
        description: `判定根拠：推定Cash Runway ${runwayMonths.toFixed(1)}ヶ月`,
      });
    }
  }

  if (metrics.hasMsWarrant) {
    signals.push({
      level: "danger",
      title: "MSワラント検出",
      description: "判定根拠：MSワラント開示あり / 希薄化警戒",
    });
  }

  if (metrics.equityFinancingCountLast3Years >= 2) {
    signals.push({
      level: "warning",
      title: "増資頻度 高",
      description: `判定根拠：過去3年のエクイティ調達 ${metrics.equityFinancingCountLast3Years}回`,
    });
  }

  if (metrics.auditorChanged) {
    signals.push({
      level: "warning",
      title: "監査法人交代",
      description: "判定根拠：監査法人の変更開示あり",
    });
  }

  if (metrics.goingConcernNote) {
    signals.push({
      level: "danger",
      title: "継続企業注記あり",
      description: "判定根拠：継続企業の前提に関する注記を検出",
    });
  }

  if (isThreeConsecutiveNegative(metrics.operatingIncomes)) {
    signals.push({
      level: "warning",
      title: "営業利益 3期連続マイナス",
      description: "判定根拠：直近3期の営業利益がすべてマイナス",
    });
  }

  if (metrics.currentRatioTrend === "declining") {
    signals.push({
      level: "warning",
      title: "流動比率 低下",
      description: "判定根拠：流動比率トレンドがdeclining",
    });
  }

  if (signals.length === 0) {
    signals.push({
      level: "positive",
      title: "主要警戒シグナル 未検出",
      description: "判定根拠：設定済み警戒条件への該当なし",
    });
  }

  return signals;
}
