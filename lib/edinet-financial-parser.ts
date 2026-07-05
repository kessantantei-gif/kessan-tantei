import AdmZip from "adm-zip";
import type { FinancialFacts } from "./financial-metrics";

export type ExtractedFinancials = {
  current: FinancialFacts;
  prior: FinancialFacts;
};

export type FiscalPeriodInfo = {
  fiscalYear?: number;
  fiscalMonth?: number;
  fiscalPeriod?: string;
  periodEnd?: string;
};

export type ExtractedFiscalPeriods = {
  current: FiscalPeriodInfo | null;
  prior: FiscalPeriodInfo | null;
};

type Row = Record<string, string>;

function parseNumber(value: string | undefined) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "－") return null;

  let normalized = raw
    .replace(/,/g, "")
    .replace(/△/g, "-")
    .replace(/▲/g, "-")
    .replace(/−/g, "-")
    .replace(/－/g, "-")
    .replace(/\s/g, "");

  if (/^\(.+\)$/.test(normalized)) {
    normalized = `-${normalized.slice(1, -1)}`;
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseLine(line: string) {
  const delimiter = line.includes("\t") ? "\t" : ",";
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.replace(/^"|"$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.replace(/^"|"$/g, ""));
  return result;
}

function parseTable(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

function field(row: Row, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return "";
}

function element(row: Row) {
  return field(row, ["要素ID", "Element ID", "element_id", "Element", "element"]);
}

function localElement(row: Row) {
  const e = element(row);
  return e.includes(":") ? e.split(":").pop() ?? e : e;
}

function name(row: Row) {
  return field(row, ["項目名", "Item Name", "item_name", "name", "Name", "ラベル", "Label"]);
}

function context(row: Row) {
  return field(row, ["コンテキストID", "Context ID", "context", "Context"]);
}

function unit(row: Row) {
  return field(row, ["単位", "Unit", "unit"]);
}

function value(row: Row) {
  return field(row, ["値", "Value", "value", "金額", "Amount", "amount"]);
}

function amount(row: Row) {
  let v = parseNumber(value(row));
  if (v === null) return null;
  const u = unit(row);
  const all = Object.values(row).join(" ");

  if (u.includes("百万円") || all.includes("百万円")) v *= 1_000_000;
  if (u.includes("千円") || all.includes("千円")) v *= 1_000;

  return v;
}

function isCurrent(row: Row) {
  const c = context(row);
  const all = Object.values(row).join(" ");

  return (
    c.includes("CurrentYear") ||
    c.includes("CurrentPeriod") ||
    all.includes("当期") ||
    all.includes("当連結") ||
    all.includes("当事業")
  );
}

function isPrior(row: Row) {
  const c = context(row);
  const all = Object.values(row).join(" ");

  return (
    c.includes("Prior") ||
    all.includes("前期") ||
    all.includes("前連結") ||
    all.includes("前事業")
  );
}

function isDuration(row: Row) {
  const c = context(row);
  const all = Object.values(row).join(" ");

  return c.includes("Duration") || all.includes("期間");
}

function isInstant(row: Row) {
  const c = context(row);
  const all = Object.values(row).join(" ");

  return c.includes("Instant") || all.includes("時点");
}

function hasSegmentContext(row: Row) {
  const c = context(row);

  return (
    c.includes("ReportableSegment") ||
    c.includes("SegmentsMember") ||
    c.includes("ReconcilingItemsMember") ||
    c.includes("BusinessReportableSegmentMember")
  );
}

function isPerShareOrRatio(row: Row) {
  const e = localElement(row).toLowerCase();
  const n = name(row);

  return (
    e.includes("pershare") ||
    e.includes("ratio") ||
    e.includes("rateofreturn") ||
    n.includes("１株当たり") ||
    n.includes("比率") ||
    n.includes("利益率")
  );
}

function exactElement(row: Row, candidates: string[]) {
  const local = localElement(row).toLowerCase();

  return candidates.some((candidate) => local === candidate.toLowerCase());
}

function nameIncludes(row: Row, candidates: string[]) {
  const n = name(row);
  return candidates.some((candidate) => n.includes(candidate));
}

function pickFact({
  rows,
  elementNames,
  nameNames,
  kind,
  period,
  exclude = () => false,
}: {
  rows: Row[];
  elementNames: string[];
  nameNames: string[];
  kind: "duration" | "instant";
  period: "current" | "prior";
  exclude?: (row: Row) => boolean;
}) {
  let pool = rows.filter((row) => {
    if (exclude(row)) return false;
    return exactElement(row, elementNames) || nameIncludes(row, nameNames);
  });

  if (pool.length === 0) return null;

  pool = pool.filter((row) => (kind === "duration" ? isDuration(row) : isInstant(row)));
  if (pool.length === 0) return null;

  if (period === "current") {
    const currentRows = pool.filter(isCurrent);
    if (currentRows.length > 0) pool = currentRows;
    pool = pool.filter((row) => !isPrior(row));
  } else {
    const priorRows = pool.filter(isPrior);
    if (priorRows.length > 0) pool = priorRows;
  }

  pool = [...pool].sort((a, b) => {
    const score = (row: Row) => {
      let s = 0;
      const c = context(row);
      const local = localElement(row);

      if (period === "current" && isCurrent(row)) s += 100;
      if (period === "prior" && isPrior(row)) s += 100;
      if (amount(row) !== null) s += 30;
      if (!hasSegmentContext(row)) s += 30;
      if (!c.includes("NonConsolidatedMember")) s += 10;
      if (local.includes("SummaryOfBusinessResults")) s += 10;
      return s;
    };

    return score(b) - score(a);
  });

  return amount(pool[0]);
}

function decodeZipEntry(entry: AdmZip.IZipEntry) {
  const buf = entry.getData();
  let text = buf.toString("utf8");
  if (text.includes("�")) {
    text = buf.toString("utf16le");
  }
  return text;
}

function fiscalInfoFromDate(dateText: string | null): FiscalPeriodInfo | null {
  if (!dateText) return null;

  const match = dateText.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const fiscalYear = Number(match[1]);
  const fiscalMonth = Number(match[2]);

  if (!Number.isFinite(fiscalYear) || !Number.isFinite(fiscalMonth)) return null;

  return {
    fiscalYear,
    fiscalMonth,
    fiscalPeriod: `${fiscalYear}年${fiscalMonth}月期`,
    periodEnd: `${match[1]}-${match[2]}-${match[3]}`,
  };
}

function extractContextDate(xml: string, contextPattern: RegExp) {
  const contexts = [...xml.matchAll(/<xbrli:context\b[\s\S]*?<\/xbrli:context>/g)];

  for (const contextXml of contexts.map((match) => match[0])) {
    const id = contextXml.match(/id="([^"]+)"/)?.[1] ?? "";
    if (!contextPattern.test(id)) continue;
    if (id.includes("Member") || contextXml.includes("<xbrli:segment")) continue;

    const endDate = contextXml.match(/<xbrli:endDate>([^<]+)<\/xbrli:endDate>/)?.[1] ?? null;
    const instant = contextXml.match(/<xbrli:instant>([^<]+)<\/xbrli:instant>/)?.[1] ?? null;

    return endDate ?? instant;
  }

  return null;
}

export function extractFiscalPeriodsFromEdinetXbrlZip(buffer: Buffer): ExtractedFiscalPeriods {
  const zip = new AdmZip(buffer);
  const xbrl = zip
    .getEntries()
    .find((entry) =>
      entry.entryName.toLowerCase().endsWith(".xbrl") &&
      entry.entryName.includes("jpcrp030000")
    ) ?? zip.getEntries().find((entry) => entry.entryName.toLowerCase().endsWith(".xbrl"));

  if (!xbrl) {
    return { current: null, prior: null };
  }

  const xml = decodeZipEntry(xbrl);

  const currentDate =
    extractContextDate(xml, /CurrentYear.*Duration/i) ??
    extractContextDate(xml, /CurrentYear.*Instant/i) ??
    extractContextDate(xml, /CurrentPeriod.*Duration/i) ??
    extractContextDate(xml, /CurrentPeriod.*Instant/i);

  const priorDate =
    extractContextDate(xml, /Prior.*Duration/i) ??
    extractContextDate(xml, /Prior.*Instant/i);

  return {
    current: fiscalInfoFromDate(currentDate),
    prior: fiscalInfoFromDate(priorDate),
  };
}

export function extractRowsFromEdinetCsvZip(buffer: Buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const mainCsv =
    entries.find((entry) => entry.entryName.includes("jpcrp030000")) ??
    entries.find((entry) => entry.entryName.toLowerCase().endsWith(".csv"));

  if (!mainCsv) return [];

  return parseTable(decodeZipEntry(mainCsv));
}

export function extractFinancials(rows: Row[]): ExtractedFinancials {
  const revenueNames = [
    "NetSalesSummaryOfBusinessResults",
    "RevenueSummaryOfBusinessResults",
    "OperatingRevenueSummaryOfBusinessResults",
    "NetSales",
    "Revenue",
    "Revenues",
    "OperatingRevenue",
    "SalesRevenue",
  ];

  const revenueLabels = [
    "売上高、経営指標等",
    "売上収益、経営指標等",
    "営業収益、経営指標等",
    "売上高",
    "売上収益",
    "営業収益",
    "収益",
  ];

  const revenue = pickFact({
    rows,
    elementNames: revenueNames,
    nameNames: revenueLabels,
    kind: "duration",
    period: "current",
    exclude: isPerShareOrRatio,
  });

  const priorRevenue = pickFact({
    rows,
    elementNames: revenueNames,
    nameNames: revenueLabels,
    kind: "duration",
    period: "prior",
    exclude: isPerShareOrRatio,
  });

  const grossProfit = pickFact({
    rows,
    elementNames: ["GrossProfit", "GrossProfitLoss"],
    nameNames: ["売上総利益", "営業総利益", "売上総損失"],
    kind: "duration",
    period: "current",
    exclude: isPerShareOrRatio,
  });

  const priorGrossProfit = pickFact({
    rows,
    elementNames: ["GrossProfit", "GrossProfitLoss"],
    nameNames: ["売上総利益", "営業総利益", "売上総損失"],
    kind: "duration",
    period: "prior",
    exclude: isPerShareOrRatio,
  });

  const operatingIncome = pickFact({
    rows,
    elementNames: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingLoss",
      "OperatingIncomeLoss",
      "ProfitLossFromOperatingActivities",
    ],
    nameNames: ["営業利益又は営業損失", "営業利益", "営業損失"],
    kind: "duration",
    period: "current",
    exclude: isPerShareOrRatio,
  });

  const priorOperatingIncome = pickFact({
    rows,
    elementNames: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingLoss",
      "OperatingIncomeLoss",
      "ProfitLossFromOperatingActivities",
    ],
    nameNames: ["営業利益又は営業損失", "営業利益", "営業損失"],
    kind: "duration",
    period: "prior",
    exclude: isPerShareOrRatio,
  });

  const netIncomeNames = [
    "ProfitLoss",
    "ProfitLossAttributableToOwnersOfParent",
    "NetIncome",
    "NetIncomeLoss",
    "ProfitAttributableToOwnersOfParent",
  ];
  const netIncomeLabels = [
    "親会社株主に帰属する当期純利益",
    "親会社株主に帰属する当期純損失",
    "当期純利益",
    "当期純損失",
  ];
  const netIncome = pickFact({
    rows,
    elementNames: netIncomeNames,
    nameNames: netIncomeLabels,
    kind: "duration",
    period: "current",
    exclude: isPerShareOrRatio,
  });
  const priorNetIncome = pickFact({
    rows,
    elementNames: netIncomeNames,
    nameNames: netIncomeLabels,
    kind: "duration",
    period: "prior",
    exclude: isPerShareOrRatio,
  });

  const operatingCF = pickFact({
    rows,
    elementNames: [
      "NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults",
      "NetCashProvidedByUsedInOperatingActivities",
      "CashFlowsFromUsedInOperatingActivities",
      "NetCashProvidedByOperatingActivities",
    ],
    nameNames: ["営業活動によるキャッシュ・フロー、経営指標等", "営業活動によるキャッシュ・フロー"],
    kind: "duration",
    period: "current",
    exclude: (row) => isPerShareOrRatio(row) || localElement(row).includes("Depreciation") || localElement(row).includes("Interest"),
  });

  const priorOperatingCF = pickFact({
    rows,
    elementNames: [
      "NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults",
      "NetCashProvidedByUsedInOperatingActivities",
      "CashFlowsFromUsedInOperatingActivities",
      "NetCashProvidedByOperatingActivities",
    ],
    nameNames: ["営業活動によるキャッシュ・フロー、経営指標等", "営業活動によるキャッシュ・フロー"],
    kind: "duration",
    period: "prior",
    exclude: (row) => isPerShareOrRatio(row) || localElement(row).includes("Depreciation") || localElement(row).includes("Interest"),
  });

  const cash = pickFact({
    rows,
    elementNames: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalents",
      "CashAndDeposits",
      "CashAndCashEquivalentsAtEndOfPeriod",
    ],
    nameNames: ["現金及び現金同等物の残高、経営指標等", "現金及び現金同等物の残高", "現金及び預金"],
    kind: "instant",
    period: "current",
    exclude: isPerShareOrRatio,
  });

  const currentLiabilities = pickFact({
    rows,
    elementNames: ["CurrentLiabilities", "LiabilitiesCurrent", "TotalCurrentLiabilities"],
    nameNames: ["流動負債"],
    kind: "instant",
    period: "current",
    exclude: isPerShareOrRatio,
  });

  const assets = pickFact({
    rows,
    elementNames: [
      "TotalAssetsSummaryOfBusinessResults",
      "Assets",
      "TotalAssets",
      "AssetsIFRS",
    ],
    nameNames: ["総資産額、経営指標等", "資産合計", "総資産"],
    kind: "instant",
    period: "current",
    exclude: (row) => isPerShareOrRatio(row) || localElement(row).toLowerCase().includes("netassets") || name(row).includes("純資産"),
  });

  const netAssets = pickFact({
    rows,
    elementNames: [
      "NetAssetsSummaryOfBusinessResults",
      "NetAssets",
      "TotalEquity",
      "EquityAttributableToOwnersOfParent",
    ],
    nameNames: ["純資産額、経営指標等", "純資産合計", "純資産", "資本合計"],
    kind: "instant",
    period: "current",
    exclude: isPerShareOrRatio,
  });

  return {
    current: {
      revenue,
      grossProfit,
      netIncome,
      operatingIncome,
      operatingCF,
      cash,
      currentLiabilities,
      assets,
      netAssets,
    },
    prior: {
      revenue: priorRevenue,
      grossProfit: priorGrossProfit,
      netIncome: priorNetIncome,
      operatingIncome: priorOperatingIncome,
      operatingCF: priorOperatingCF,
      cash: null,
      currentLiabilities: null,
      assets: null,
      netAssets: null,
    },
  };
}
