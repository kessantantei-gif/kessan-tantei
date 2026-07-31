import AdmZip from "adm-zip";

export type TdnetTextBlockFinancials = {
  revenue: number | null;
  operatingIncome: number | null;
  ordinaryIncome: number | null;
  profitAttributableToOwners: number | null;
  source: "html-table" | null;
};

type MetricName =
  | "revenue"
  | "operatingIncome"
  | "ordinaryIncome"
  | "profitAttributableToOwners";

const METRIC_LABELS: Array<{ metric: MetricName; patterns: RegExp[] }> = [
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
    .replace(/^(?:注)?\d+[.)]?$/, "")
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

function findMetric(cells: string[]) {
  const label = cells.join(" ").replace(/\s+/g, "");
  return METRIC_LABELS.find(({ patterns }) => patterns.some((pattern) => pattern.test(label))) ?? null;
}

function lastNumericCell(cells: string[]) {
  const values = cells.map(numericCell).filter((value): value is number => value !== null);
  return values.at(-1) ?? null;
}

function parseDocument(document: string) {
  const result: Omit<TdnetTextBlockFinancials, "source"> = {
    revenue: null,
    operatingIncome: null,
    ordinaryIncome: null,
    profitAttributableToOwners: null,
  };
  const multiplier = unitMultiplier(document);

  for (const rowMatch of document.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [
      ...rowMatch[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi),
    ].map((match) => cleanCell(match[1]));
    if (cells.length < 2) continue;

    const metric = findMetric(cells);
    if (!metric || result[metric.metric] !== null) continue;

    const value = lastNumericCell(cells);
    if (value === null) continue;

    const rowLabel = cells.join(" ");
    const signed = /損失/.test(rowLabel) && value > 0 ? -value : value;
    result[metric.metric] = signed * multiplier;
  }

  return result;
}

export function parseTdnetTextBlockFinancials(buffer: Buffer): TdnetTextBlockFinancials {
  const zip = new AdmZip(buffer);
  const documents = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && /-ixbrl\.html?$/i.test(entry.entryName))
    .map((entry) => entry.getData().toString("utf8"));

  const result: TdnetTextBlockFinancials = {
    revenue: null,
    operatingIncome: null,
    ordinaryIncome: null,
    profitAttributableToOwners: null,
    source: null,
  };

  for (const document of documents) {
    const parsed = parseDocument(document);
    for (const metric of [
      "revenue",
      "operatingIncome",
      "ordinaryIncome",
      "profitAttributableToOwners",
    ] as const) {
      if (result[metric] === null && parsed[metric] !== null) {
        result[metric] = parsed[metric];
        result.source = "html-table";
      }
    }
  }

  return result;
}
