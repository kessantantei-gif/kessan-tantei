import AdmZip from "adm-zip";
import type { FinancialFacts } from "./financial-metrics";

export type FinancialMetricProfile =
  | "general"
  | "bank"
  | "securities"
  | "insurance"
  | "special-finance"
  | "commodity";

export type FinancialMetricMetadata = {
  financialProfile: FinancialMetricProfile;
  revenueLabel: string;
  operatingIncomeLabel: string;
  currentRatioApplicable: boolean;
};

export type ExtractedFinancials = {
  current: FinancialFacts & FinancialMetricMetadata;
  prior: FinancialFacts;
  metadata: FinancialMetricMetadata;
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

type ProfileDefinition = FinancialMetricMetadata & {
  revenueElements: string[];
  revenueLabels: string[];
  operatingIncomeElements: string[];
  operatingIncomeLabels: string[];
  cashElements: string[];
  cashLabels: string[];
};

const PROFILE_DEFINITIONS: Record<FinancialMetricProfile, ProfileDefinition> = {
  general: {
    financialProfile: "general",
    revenueLabel: "売上高",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
    revenueElements: [
      "NetSalesSummaryOfBusinessResults",
      "RevenueSummaryOfBusinessResults",
      "OperatingRevenueSummaryOfBusinessResults",
      "NetSales",
      "Revenue",
      "Revenues",
      "OperatingRevenue",
      "SalesRevenue",
    ],
    revenueLabels: [
      "売上高、経営指標等",
      "売上収益、経営指標等",
      "営業収益、経営指標等",
      "売上高",
      "売上収益",
      "営業収益",
    ],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingLoss",
      "OperatingIncomeLoss",
      "ProfitLossFromOperatingActivities",
    ],
    operatingIncomeLabels: ["営業利益又は営業損失", "営業利益", "営業損失"],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalents",
      "CashAndDeposits",
      "CashAndCashEquivalentsAtEndOfPeriod",
    ],
    cashLabels: [
      "現金及び現金同等物の残高、経営指標等",
      "現金及び現金同等物の残高",
      "現金及び預金",
    ],
  },
  bank: {
    financialProfile: "bank",
    revenueLabel: "経常収益",
    operatingIncomeLabel: "経常利益",
    currentRatioApplicable: false,
    revenueElements: [
      "OrdinaryIncomeBNK",
      "OrdinaryIncomeSummaryOfBusinessResults",
      "OperatingRevenueBNK",
      "RevenueSummaryOfBusinessResults",
    ],
    revenueLabels: ["経常収益、経営指標等", "経常収益"],
    // 銀行業には営業利益の概念がないため、経常利益を比較利益として使用する。
    operatingIncomeElements: ["OrdinaryIncome", "OrdinaryProfitLoss"],
    operatingIncomeLabels: ["経常利益又は経常損失", "経常利益", "経常損失"],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalents",
      "CashAndDueFromBanksAssetsBNK",
      "CashAndDeposits",
    ],
    cashLabels: [
      "現金及び現金同等物の残高、経営指標等",
      "現金及び現金同等物の残高",
      "現金預け金",
    ],
  },
  securities: {
    financialProfile: "securities",
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
    revenueElements: [
      "OperatingRevenueSEC",
      "NetOperatingRevenueSEC",
      "OperatingRevenueSummaryOfBusinessResults",
      "OperatingRevenue",
      "Revenue",
    ],
    revenueLabels: ["営業収益、経営指標等", "営業収益", "純営業収益"],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingIncomeLoss",
      "OrdinaryIncome",
    ],
    operatingIncomeLabels: [
      "営業利益又は営業損失",
      "営業利益",
      "営業損失",
      "経常利益又は経常損失",
    ],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalents",
      "CashAndDeposits",
    ],
    cashLabels: [
      "現金及び現金同等物の残高、経営指標等",
      "現金及び現金同等物の残高",
      "現金及び預金",
    ],
  },
  insurance: {
    financialProfile: "insurance",
    revenueLabel: "経常収益",
    operatingIncomeLabel: "経常利益",
    currentRatioApplicable: false,
    // 保険業タクソノミでは OperatingIncomeINS が「経常収益」を表す。
    revenueElements: [
      "OperatingIncomeINS",
      "OrdinaryIncomeSummaryOfBusinessResults",
      "OperatingRevenueINS",
    ],
    revenueLabels: ["経常収益、経営指標等", "経常収益"],
    // 保険業には営業利益の概念がないため、経常利益を比較利益として使用する。
    operatingIncomeElements: ["OrdinaryIncome", "OrdinaryProfitLoss"],
    operatingIncomeLabels: ["経常利益又は経常損失", "経常利益", "経常損失"],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalents",
      "CashAndDepositsAssetsINS",
      "CashAndDeposits",
    ],
    cashLabels: [
      "現金及び現金同等物の残高、経営指標等",
      "現金及び現金同等物の残高",
      "現金及び預貯金",
    ],
  },
  "special-finance": {
    financialProfile: "special-finance",
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
    revenueElements: [
      "OperatingRevenueSPF",
      "OperatingRevenueSummaryOfBusinessResults",
      "OperatingRevenue",
      "Revenue",
    ],
    revenueLabels: ["営業収益、経営指標等", "営業収益"],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingIncomeLoss",
      "OrdinaryIncome",
    ],
    operatingIncomeLabels: ["営業利益又は営業損失", "営業利益", "営業損失"],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalents",
      "CashAndDeposits",
    ],
    cashLabels: [
      "現金及び現金同等物の残高、経営指標等",
      "現金及び現金同等物の残高",
      "現金及び預金",
    ],
  },
  commodity: {
    financialProfile: "commodity",
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
    revenueElements: [
      "OperatingRevenueCMD",
      "OperatingRevenueSummaryOfBusinessResults",
      "OperatingRevenue",
      "Revenue",
    ],
    revenueLabels: ["営業収益、経営指標等", "営業収益"],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingIncomeLoss",
      "OrdinaryIncome",
    ],
    operatingIncomeLabels: ["営業利益又は営業損失", "営業利益", "営業損失"],
    cashElements: [
      "CashAndCashEquivalentsSummaryOfBusinessResults",
      "CashAndCashEquivalents",
      "CashAndDeposits",
    ],
    cashLabels: [
      "現金及び現金同等物の残高、経営指標等",
      "現金及び現金同等物の残高",
      "現金及び預金",
    ],
  },
};

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

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
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

  const headers = parseLine(lines[0]).map((header) => header.trim());
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
  const id = element(row);
  return id.includes(":") ? id.split(":").pop() ?? id : id;
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
  let parsed = parseNumber(value(row));
  if (parsed === null) return null;

  const rowUnit = unit(row);
  const all = Object.values(row).join(" ");
  if (rowUnit.includes("百万円") || all.includes("百万円")) parsed *= 1_000_000;
  if (rowUnit.includes("千円") || all.includes("千円")) parsed *= 1_000;
  return parsed;
}

function isCurrent(row: Row) {
  const rowContext = context(row);
  const all = Object.values(row).join(" ");
  return (
    rowContext.includes("CurrentYear") ||
    rowContext.includes("CurrentPeriod") ||
    all.includes("当期") ||
    all.includes("当連結") ||
    all.includes("当事業")
  );
}

function isPrior(row: Row) {
  const rowContext = context(row);
  const all = Object.values(row).join(" ");
  return (
    rowContext.includes("Prior") ||
    rowContext.includes("Previous") ||
    all.includes("前期") ||
    all.includes("前連結") ||
    all.includes("前事業")
  );
}

function isDuration(row: Row) {
  const rowContext = context(row);
  const all = Object.values(row).join(" ");
  return rowContext.includes("Duration") || all.includes("期間");
}

function isInstant(row: Row) {
  const rowContext = context(row);
  const all = Object.values(row).join(" ");
  return rowContext.includes("Instant") || all.includes("時点");
}

function hasSegmentContext(row: Row) {
  const rowContext = context(row);
  return (
    rowContext.includes("ReportableSegment") ||
    rowContext.includes("SegmentsMember") ||
    rowContext.includes("ReconcilingItemsMember") ||
    rowContext.includes("BusinessReportableSegmentMember")
  );
}

function isPerShareOrRatio(row: Row) {
  const id = localElement(row).toLowerCase();
  const rowName = name(row);
  return (
    id.includes("pershare") ||
    id.includes("ratio") ||
    id.includes("rateofreturn") ||
    rowName.includes("１株当たり") ||
    rowName.includes("比率") ||
    rowName.includes("利益率")
  );
}

function exactElementIndex(row: Row, candidates: string[]) {
  const local = localElement(row).toLowerCase();
  return candidates.findIndex((candidate) => local === candidate.toLowerCase());
}

function labelIndex(row: Row, candidates: string[]) {
  const rowName = name(row);
  return candidates.findIndex((candidate) => rowName.includes(candidate));
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
    return exactElementIndex(row, elementNames) >= 0 || labelIndex(row, nameNames) >= 0;
  });

  pool = pool.filter((row) => (kind === "duration" ? isDuration(row) : isInstant(row)));
  if (period === "current") {
    const currentRows = pool.filter(isCurrent);
    if (currentRows.length > 0) pool = currentRows;
    pool = pool.filter((row) => !isPrior(row));
  } else {
    const priorRows = pool.filter(isPrior);
    if (priorRows.length > 0) pool = priorRows;
    else pool = pool.filter((row) => !isCurrent(row));
  }
  if (pool.length === 0) return null;

  pool = [...pool].sort((left, right) => {
    const score = (row: Row) => {
      let result = 0;
      const rowContext = context(row);
      const exactIndex = exactElementIndex(row, elementNames);
      const matchedLabelIndex = labelIndex(row, nameNames);

      if (period === "current" && isCurrent(row)) result += 10_000;
      if (period === "prior" && isPrior(row)) result += 10_000;
      if (exactIndex >= 0) result += 2_000 + (elementNames.length - exactIndex) * 20;
      else if (matchedLabelIndex >= 0) result += 500 + (nameNames.length - matchedLabelIndex) * 5;
      if (amount(row) !== null) result += 100;
      if (!hasSegmentContext(row)) result += 100;
      if (!rowContext.includes("NonConsolidatedMember")) result += 50;
      if (rowContext.includes("Consolidated")) result += 30;
      if (localElement(row).includes("SummaryOfBusinessResults")) result += 20;
      return result;
    };
    return score(right) - score(left);
  });

  return amount(pool[0]);
}

function detectFinancialProfile(rows: Row[]): FinancialMetricProfile {
  const elements = new Set(rows.map((row) => localElement(row)));
  if (elements.has("OrdinaryIncomeBNK") || elements.has("CashAndDueFromBanksAssetsBNK")) {
    return "bank";
  }
  if (elements.has("OperatingIncomeINS") || elements.has("CashAndDepositsAssetsINS")) {
    return "insurance";
  }
  if (elements.has("OperatingRevenueSEC") || elements.has("NetOperatingRevenueSEC")) {
    return "securities";
  }
  if (elements.has("OperatingRevenueSPF")) return "special-finance";
  if (elements.has("OperatingRevenueCMD")) return "commodity";
  return "general";
}

function decodeZipEntry(entry: AdmZip.IZipEntry) {
  const buffer = entry.getData();
  let text = buffer.toString("utf8");
  if (text.includes("�")) text = buffer.toString("utf16le");
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

export function extractFiscalPeriodsFromEdinetXbrlZip(
  buffer: Buffer
): ExtractedFiscalPeriods {
  const zip = new AdmZip(buffer);
  const xbrl =
    zip
      .getEntries()
      .find(
        (entry) =>
          entry.entryName.toLowerCase().endsWith(".xbrl") &&
          entry.entryName.includes("jpcrp030000")
      ) ??
    zip.getEntries().find((entry) => entry.entryName.toLowerCase().endsWith(".xbrl"));

  if (!xbrl) return { current: null, prior: null };
  const xml = decodeZipEntry(xbrl);
  const currentDate =
    extractContextDate(xml, /CurrentYear.*Duration/i) ??
    extractContextDate(xml, /CurrentYear.*Instant/i) ??
    extractContextDate(xml, /CurrentPeriod.*Duration/i) ??
    extractContextDate(xml, /CurrentPeriod.*Instant/i);
  const priorDate =
    extractContextDate(xml, /Prior.*Duration/i) ??
    extractContextDate(xml, /Prior.*Instant/i) ??
    extractContextDate(xml, /Previous.*Duration/i) ??
    extractContextDate(xml, /Previous.*Instant/i);

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
  const profile = detectFinancialProfile(rows);
  const definition = PROFILE_DEFINITIONS[profile];

  const revenue = pickFact({
    rows,
    elementNames: definition.revenueElements,
    nameNames: definition.revenueLabels,
    kind: "duration",
    period: "current",
    exclude: isPerShareOrRatio,
  });
  const priorRevenue = pickFact({
    rows,
    elementNames: definition.revenueElements,
    nameNames: definition.revenueLabels,
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
    elementNames: definition.operatingIncomeElements,
    nameNames: definition.operatingIncomeLabels,
    kind: "duration",
    period: "current",
    exclude: isPerShareOrRatio,
  });
  const priorOperatingIncome = pickFact({
    rows,
    elementNames: definition.operatingIncomeElements,
    nameNames: definition.operatingIncomeLabels,
    kind: "duration",
    period: "prior",
    exclude: isPerShareOrRatio,
  });

  const netIncomeElements = [
    "ProfitLossAttributableToOwnersOfParent",
    "ProfitAttributableToOwnersOfParent",
    "ProfitLoss",
    "NetIncome",
    "NetIncomeLoss",
  ];
  const netIncomeLabels = [
    "親会社株主に帰属する当期純利益",
    "親会社株主に帰属する当期純損失",
    "当期純利益",
    "当期純損失",
  ];
  const netIncome = pickFact({
    rows,
    elementNames: netIncomeElements,
    nameNames: netIncomeLabels,
    kind: "duration",
    period: "current",
    exclude: isPerShareOrRatio,
  });
  const priorNetIncome = pickFact({
    rows,
    elementNames: netIncomeElements,
    nameNames: netIncomeLabels,
    kind: "duration",
    period: "prior",
    exclude: isPerShareOrRatio,
  });

  const operatingCFElements = [
    "NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults",
    "NetCashProvidedByUsedInOperatingActivities",
    "CashFlowsFromUsedInOperatingActivities",
    "NetCashProvidedByOperatingActivities",
  ];
  const operatingCFLabels = [
    "営業活動によるキャッシュ・フロー、経営指標等",
    "営業活動によるキャッシュ・フロー",
  ];
  const cfExclude = (row: Row) =>
    isPerShareOrRatio(row) ||
    localElement(row).includes("Depreciation") ||
    localElement(row).includes("Interest");
  const operatingCF = pickFact({
    rows,
    elementNames: operatingCFElements,
    nameNames: operatingCFLabels,
    kind: "duration",
    period: "current",
    exclude: cfExclude,
  });
  const priorOperatingCF = pickFact({
    rows,
    elementNames: operatingCFElements,
    nameNames: operatingCFLabels,
    kind: "duration",
    period: "prior",
    exclude: cfExclude,
  });

  const cash = pickFact({
    rows,
    elementNames: definition.cashElements,
    nameNames: definition.cashLabels,
    kind: "instant",
    period: "current",
    exclude: isPerShareOrRatio,
  });

  const currentLiabilities = definition.currentRatioApplicable
    ? pickFact({
        rows,
        elementNames: ["CurrentLiabilities", "LiabilitiesCurrent", "TotalCurrentLiabilities"],
        nameNames: ["流動負債"],
        kind: "instant",
        period: "current",
        exclude: isPerShareOrRatio,
      })
    : null;

  const assets = pickFact({
    rows,
    elementNames: [
      "TotalAssetsSummaryOfBusinessResults",
      "Assets",
      "TotalAssets",
      "AssetsIFRS",
    ],
    nameNames: ["総資産額、経営指標等", "資産合計", "総資産", "資産"],
    kind: "instant",
    period: "current",
    exclude: (row) =>
      isPerShareOrRatio(row) ||
      localElement(row).toLowerCase().includes("netassets") ||
      name(row).includes("純資産"),
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
      financialProfile: definition.financialProfile,
      revenueLabel: definition.revenueLabel,
      operatingIncomeLabel: definition.operatingIncomeLabel,
      currentRatioApplicable: definition.currentRatioApplicable,
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
    metadata: {
      financialProfile: definition.financialProfile,
      revenueLabel: definition.revenueLabel,
      operatingIncomeLabel: definition.operatingIncomeLabel,
      currentRatioApplicable: definition.currentRatioApplicable,
    },
  };
}
