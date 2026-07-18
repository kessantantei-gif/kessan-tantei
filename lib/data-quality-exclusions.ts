export type DataQualityExclusion = {
  ticker: string;
  reason: string;
  scope: "ranking";
};

const DATA_QUALITY_EXCLUSIONS: Record<string, DataQualityExclusion> = {
  "6196": {
    ticker: "6196",
    reason:
      "EDINETから取得した最新提出書類の決算期が不自然なため、決算期の再確認が完了するまでランキング集計から除外しています。",
    scope: "ranking",
  },
  "7186": {
    ticker: "7186",
    reason:
      "EDINETから取得した最新提出書類の決算期が不自然なため、決算期の再確認が完了するまでランキング集計から除外しています。",
    scope: "ranking",
  },
};

export function getDataQualityExclusion(ticker: string) {
  return DATA_QUALITY_EXCLUSIONS[ticker] ?? null;
}

export function isRankingExcludedByDataQuality(ticker: string) {
  return getDataQualityExclusion(ticker)?.scope === "ranking";
}
