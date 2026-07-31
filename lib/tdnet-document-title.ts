export type TdnetDocumentType =
  | "q1_earnings"
  | "q2_earnings"
  | "q3_earnings"
  | "annual_earnings"
  | "forecast_revision"
  | "dividend_revision"
  | "correction"
  | "other";

export type TdnetTitleClassification = {
  documentType: TdnetDocumentType;
  quarter: 1 | 2 | 3 | 4 | null;
  isCorrection: boolean;
};

function compact(title: string) {
  return title.normalize("NFKC").replace(/\s+/g, "");
}

export function isTdnetSupplementalMaterial(title: string) {
  const normalized = compact(title);
  return (
    /決算短信.*(?:補足資料|補足説明資料|決算説明資料|説明会資料|参考資料|補足説明|説明資料)/.test(
      normalized
    ) ||
    /(?:補足資料|補足説明資料|決算説明資料|説明会資料|参考資料).*(?:決算短信|決算)/.test(
      normalized
    )
  );
}

export function isTdnetTimingOrDelayNotice(title: string) {
  const normalized = compact(title);
  return (
    /決算短信.*(?:開示|公表|発表).*(?:\d+日|超え|超過|延期|遅延|延長|予定|時期|日程|変更|見込み|未定)/.test(
      normalized
    ) ||
    /(?:期末|四半期末).*後.*\d+日.*(?:超え|超過)/.test(normalized) ||
    /(?:超え|超過|延期|遅延|延長).*(?:決算短信|決算発表)/.test(normalized) ||
    /決算発表.*(?:延期|遅延|変更|予定|時期|日程|見込み|未定)/.test(normalized)
  );
}

export function isTdnetNonNumericCorrectionNotice(title: string, xbrlUrl: string | null = null) {
  const normalized = compact(title);
  if (!/決算短信/.test(normalized)) return false;

  // 数値データ訂正は、タイトル末尾が「お知らせ」でも決算数値の正式訂正として残す。
  if (/数値データ訂正/.test(normalized)) return false;

  if (/過年度.*(?:決算短信|決算).*訂正.*(?:お知らせ|関するお知らせ)/.test(normalized)) {
    return true;
  }

  if (/(?:訂正|修正).*(?:お知らせ|関するお知らせ)/.test(normalized)) {
    return true;
  }

  if (/(?:一部)?訂正について/.test(normalized)) {
    return !xbrlUrl;
  }

  return false;
}

export function isTdnetNonEarningsDocument(title: string, xbrlUrl: string | null = null) {
  return (
    isTdnetSupplementalMaterial(title) ||
    isTdnetTimingOrDelayNotice(title) ||
    isTdnetNonNumericCorrectionNotice(title, xbrlUrl)
  );
}

export function classifyTdnetTitle(
  title: string,
  xbrlUrl: string | null = null
): TdnetTitleClassification {
  const normalized = title.normalize("NFKC");
  const isCorrection = /訂正|修正/.test(normalized);

  if (isTdnetNonEarningsDocument(normalized, xbrlUrl)) {
    return { documentType: "other", quarter: null, isCorrection };
  }
  if (/配当予想/.test(normalized)) {
    return { documentType: "dividend_revision", quarter: null, isCorrection };
  }
  if (/業績予想/.test(normalized) && /修正/.test(normalized)) {
    return { documentType: "forecast_revision", quarter: null, isCorrection };
  }
  if (!/決算短信/.test(normalized)) {
    return { documentType: "other", quarter: null, isCorrection };
  }
  if (/第1四半期|第１四半期|1Q|１Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q1_earnings", quarter: 1, isCorrection };
  }
  if (/第2四半期|第２四半期|中間期|中間決算|2Q|２Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q2_earnings", quarter: 2, isCorrection };
  }
  if (/第3四半期|第３四半期|3Q|３Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q3_earnings", quarter: 3, isCorrection };
  }
  return { documentType: isCorrection ? "correction" : "annual_earnings", quarter: 4, isCorrection };
}

export function isTdnetActualEarningsDocument(title: string, xbrlUrl: string | null = null) {
  const classification = classifyTdnetTitle(title, xbrlUrl);
  return (
    classification.quarter !== null &&
    ["q1_earnings", "q2_earnings", "q3_earnings", "annual_earnings", "correction"].includes(
      classification.documentType
    )
  );
}
