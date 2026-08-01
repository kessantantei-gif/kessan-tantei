import AdmZip from "adm-zip";

export type TdnetTextBlockFinancials = {
  revenue: number | null;
  operatingIncome: number | null;
  ordinaryIncome: number | null;
  profitAttributableToOwners: number | null;
  operatingCF: number | null;
  investingCF: number | null;
  financingCF: number | null;
  source: "html-table" | null;
  cashFlowTableFound: boolean;
};

type ProfitMetricName =
  | "revenue"
  | "operatingIncome"
  | "ordinaryIncome"
  | "profitAttributableToOwners";

type CashFlowMetricName = "operatingCF" | "investingCF" | "financingCF";
type MetricName = ProfitMetricName | CashFlowMetricName;

const PROFIT_METRIC_LABELS: Array<{ metric: ProfitMetricName; patterns: RegExp[] }> = [
  {
    metric: "profitAttributableToOwners",
    patterns: [
      /親会社株主に帰属する(?:当期|四半期|中間)純利益/,
      /親会社株主に帰属する(?:当期|四半期|中間)純損失/,
      /親会社の所有者に帰属する(?:当期|四半期|中間)利益/,
      /親会社の所有者に帰属する(?:当期|四半期|中間)損失/,
    ],
  },
  {
    metric: "ordinaryIncome",
    patterns: [/経常利益/, /経常損失/],
  },
  {
    metric: "operatingIncome",
    patterns: [/営業利益/, /営業損失/],
  },
  {
    metric: "revenue",
    patterns: [/売上高/, /売上収益/, /営業収益/, /経常収益/],
  },
];

const CASH_FLOW_METRIC_LABELS: Array<{ metric: CashFlowMetricName; patterns: RegExp[] }> = [
  {
    metric: "operatingCF",
    patterns: [
      /営業活動によるキャッシュ・フロー/,
      /営業活動から得たキャッシュ・フロー/,
      /営業活動による現金及び現金同等物の増減額/,
    ],
  },
  {
    metric: "investingCF",
    patterns: [
      /投資活動によるキャッシュ・フロー/,
      /投資活動に使用したキャッシュ・フロー/,
      /投資活動による現金及び現金同等物の増減額/,
    ],
  },
  {
    metric: "financingCF",
    patterns: [
      /財務活動によるキャッシュ・フロー/,
      /財務活動に使用したキャッシュ・フロー/,
      /財務活動による現金及び現金同等物の増減額/,
    ],
  },
];

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#([0-9]+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanCell(value: string) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function numericCell(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[，,]/g, "")
    .replace(/[▲△]/g, "-")
    .replace(/[−－–—]/g, "-")
    .replace(/^\((.*)\)$/, "-$1")
    .trim();

  if (!normalized || /^(?:-|―|－|—|N\/A)$/i.test(normalized)) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function unitMultiplier(document: string) {
  const text = cleanCell(document.slice(0, 200_000));
  if (/単位[:：]?\s*百万円/.test(text)) return 1_000_000;
  if (/単位[:：]?\s*千円/.test(text)) return 1_000;
  return 1;
}

function findMetric(
  cells: string[],
  labels: Array<{ metric: MetricName; patterns: RegExp[] }>
) {
  const label = cells.join(" ").replace(/\s+/g, "");
  return labels.find(({ patterns }) => patterns.some((pattern) => pattern.test(label))) ?? null;
}

function lastNumericCell(cells: string[]) {
  const values = cells.map(numericCell).filter((value): value is number => value !== null);
  return values.at(-1) ?? null;
}

function emptyMetrics(): Omit<TdnetTextBlockFinancials, "source" | "cashFlowTableFound"> {
  return {
    revenue: null,
    operatingIncome: null,
    ordinaryIncome: null,
    profitAttributableToOwners: null,
    operatingCF: null,
    investingCF: null,
    financingCF: null,
  };
}

function parseDocument(
  document: string,
  labels: Array<{ metric: MetricName; patterns: RegExp[] }>
) {
  const result = emptyMetrics();
  const multiplier = unitMultiplier(document);

  for (const rowMatch of document.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [
      ...rowMatch[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi),
    ].map((match) => cleanCell(match[1]));
    if (cells.length < 2) continue;

    const metric = findMetric(cells, labels);
    if (!metric || result[metric.metric] !== null) continue;

    const value = lastNumericCell(cells);
    if (value === null) continue;

    const rowLabel = cells.join(" ");
    const signed = /損失/.test(rowLabel) && value > 0 ? -value : value;
    result[metric.metric] = signed * multiplier;
  }

  return result;
}

function isProfitLossEntry(name: string) {
  return /(?:acpl|qcpl|statementofincome|profitandloss)/i.test(name);
}

function isCashFlowEntry(name: string) {
  return /(?:accf|qccf|cash.?flow|statementofcashflows?)/i.test(name);
}

function entryPriority(name: string) {
  if (isProfitLossEntry(name)) return 0;
  if (/\/Summary\//i.test(name)) return 1;
  if (isCashFlowEntry(name)) return 2;
  return 10;
}

export function parseTdnetTextBlockFinancials(buffer: Buffer): TdnetTextBlockFinancials {
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && /-ixbrl\.html?$/i.test(entry.entryName))
    .sort((a, b) => entryPriority(a.entryName) - entryPriority(b.entryName));

  const result: TdnetTextBlockFinancials = {
    ...emptyMetrics(),
    source: null,
    cashFlowTableFound: entries.some((entry) => isCashFlowEntry(entry.entryName)),
  };

  for (const entry of entries) {
    const document = entry.getData().toString("utf8");
    const labels = isCashFlowEntry(entry.entryName)
      ? CASH_FLOW_METRIC_LABELS
      : PROFIT_METRIC_LABELS;
    const parsed = parseDocument(document, labels);
    const metrics: MetricName[] = isCashFlowEntry(entry.entryName)
      ? ["operatingCF", "investingCF", "financingCF"]
      : ["revenue", "operatingIncome", "ordinaryIncome", "profitAttributableToOwners"];

    for (const metric of metrics) {
      if (result[metric] === null && parsed[metric] !== null) {
        result[metric] = parsed[metric];
        result.source = "html-table";
      }
    }
  }

  return result;
}
