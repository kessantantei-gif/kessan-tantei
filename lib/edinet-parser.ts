import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

export type Financials = {
  revenue: number;
  operatingIncome: number;
  operatingCF: number;
  cash: number;
  currentAssets: number;
  currentLiabilities: number;
  assets: number;
  netAssets: number;
  periodEnd?: string;
  fiscalYear?: number;
  fiscalMonth?: number;
  fiscalPeriod?: string;
};

type ContextInfo = {
  id: string;
  startDate?: string;
  endDate?: string;
  instant?: string;
  consolidated: boolean;
  currentYear: boolean;
  priorYear: boolean;
};

type NumericFact = {
  name: string;
  contextRef: string;
  value: number;
};

type MetricDefinition = {
  exact: string[];
  contains?: string[];
  excludes?: string[];
};

const METRICS: Record<keyof Pick<Financials,
  | "revenue"
  | "operatingIncome"
  | "operatingCF"
  | "cash"
  | "currentAssets"
  | "currentLiabilities"
  | "assets"
  | "netAssets"
>, MetricDefinition> = {
  revenue: {
    exact: [
      "NetSales",
      "Sales",
      "Revenue",
      "Revenues",
      "RevenueIFRS",
      "OperatingRevenue",
      "OperatingRevenueIFRS",
      "BusinessRevenue",
      "SalesRevenueNet",
      "SalesRevenueGoodsNet",
      "SalesRevenueServicesNet",
      "RevenueFromContractsWithCustomers",
      "RevenueFromContractsWithCustomersExcludingAssessedTax",
    ],
    contains: ["revenue", "netsales", "salesrevenue"],
    excludes: ["cost", "segment", "geographic", "perShare", "forecast"],
  },
  operatingIncome: {
    exact: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingProfitLoss",
      "OperatingProfitLossIFRS",
      "OperatingIncomeLoss",
    ],
    contains: ["operatingincome", "operatingprofit", "operatingloss"],
    excludes: ["segment", "forecast", "perShare"],
  },
  operatingCF: {
    exact: [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashFlowsFromUsedInOperatingActivities",
      "CashFlowsFromUsedInOperatingActivities",
      "CashFlowsFromUsedInOperatingActivitiesIFRS",
    ],
    contains: ["cashprovidedbyusedinoperatingactivities", "cashflowsfromusedinoperatingactivities"],
    excludes: ["continuingOperations", "discontinuedOperations"],
  },
  cash: {
    exact: [
      "CashAndCashEquivalents",
      "CashAndCashEquivalentsIFRS",
      "CashAndCashEquivalentsAtCarryingValue",
      "CashAndDeposits",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    ],
    contains: ["cashandcashequivalents", "cashanddeposits"],
    excludes: ["increase", "decrease", "change", "effect", "beginning", "endingBalanceSheet"],
  },
  currentAssets: {
    exact: ["CurrentAssets", "CurrentAssetsIFRS", "AssetsCurrent"],
    contains: ["currentassets", "assetscurrent"],
    excludes: ["noncurrent", "segment"],
  },
  currentLiabilities: {
    exact: ["CurrentLiabilities", "CurrentLiabilitiesIFRS", "LiabilitiesCurrent"],
    contains: ["currentliabilities", "liabilitiescurrent"],
    excludes: ["noncurrent", "segment"],
  },
  assets: {
    exact: ["Assets", "AssetsIFRS", "TotalAssets"],
    contains: ["totalassets"],
    excludes: ["current", "noncurrent", "segment", "average", "returnOn"],
  },
  netAssets: {
    exact: [
      "NetAssets",
      "Equity",
      "EquityIFRS",
      "StockholdersEquity",
      "PartnersCapital",
      "EquityAttributableToOwnersOfParent",
      "EquityAttributableToOwnersOfParentIFRS",
    ],
    contains: ["netassets", "stockholdersequity", "equityattributabletoownersofparent"],
    excludes: ["ratio", "perShare", "segment", "average", "returnOn"],
  },
};

export function parseEdinetFinancials(docID: string): Financials {
  const zipPath = path.join(process.cwd(), "downloads", `${docID}.zip`);

  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP not found: ${zipPath}`);
  }

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  const xbrlEntry = entries.find(
    (entry) =>
      entry.entryName.startsWith("XBRL/PublicDoc/") &&
      entry.entryName.endsWith(".xbrl")
  );

  const htmEntries = entries.filter(
    (entry) =>
      entry.entryName.startsWith("XBRL/PublicDoc/") &&
      entry.entryName.endsWith(".htm")
  );

  const fromXbrl = xbrlEntry
    ? parseStandardXbrl(xbrlEntry.getData().toString("utf8"))
    : emptyFinancials();

  const fromInline = htmEntries.reduce<Financials>((merged, entry) => {
    const parsed = parseInlineXbrl(entry.getData().toString("utf8"));
    return mergeFinancials(merged, parsed);
  }, emptyFinancials());

  return mergeFinancials(fromXbrl, fromInline);
}

export function zeroFinancialFields(financials: Financials): string[] {
  return [
    "revenue",
    "operatingIncome",
    "operatingCF",
    "cash",
    "currentAssets",
    "currentLiabilities",
    "assets",
    "netAssets",
  ].filter((key) => financials[key as keyof Financials] === 0);
}

function emptyFinancials(): Financials {
  return {
    revenue: 0,
    operatingIncome: 0,
    operatingCF: 0,
    cash: 0,
    currentAssets: 0,
    currentLiabilities: 0,
    assets: 0,
    netAssets: 0,
  };
}

function mergeFinancials(primary: Financials, fallback: Financials): Financials {
  return {
    revenue: chooseNumber(primary.revenue, fallback.revenue),
    operatingIncome: chooseNumber(primary.operatingIncome, fallback.operatingIncome),
    operatingCF: chooseNumber(primary.operatingCF, fallback.operatingCF),
    cash: chooseNumber(primary.cash, fallback.cash),
    currentAssets: chooseNumber(primary.currentAssets, fallback.currentAssets),
    currentLiabilities: chooseNumber(primary.currentLiabilities, fallback.currentLiabilities),
    assets: chooseNumber(primary.assets, fallback.assets),
    netAssets: chooseNumber(primary.netAssets, fallback.netAssets),
    periodEnd: primary.periodEnd ?? fallback.periodEnd,
    fiscalYear: primary.fiscalYear ?? fallback.fiscalYear,
    fiscalMonth: primary.fiscalMonth ?? fallback.fiscalMonth,
    fiscalPeriod: primary.fiscalPeriod ?? fallback.fiscalPeriod,
  };
}

function chooseNumber(primary: number, fallback: number) {
  return primary !== 0 ? primary : fallback;
}

function parseStandardXbrl(text: string): Financials {
  const contexts = parseContexts(text);
  const facts = parseStandardFacts(text);
  return buildFinancials(facts, contexts);
}

function parseInlineXbrl(text: string): Financials {
  const contexts = parseContexts(text);
  const facts: NumericFact[] = [];
  const regex = /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi;

  for (const match of text.matchAll(regex)) {
    const attrs = parseAttributes(match[1]);
    const name = attrs.name;
    const contextRef = attrs.contextref;
    if (!name || !contextRef) continue;

    const rawText = decodeXml(match[2].replace(/<[^>]+>/g, "")).replace(/,/g, "").trim();
    if (!rawText || attrs.nil === "true") continue;

    let value = Number(rawText);
    if (!Number.isFinite(value)) continue;

    const scale = Number(attrs.scale ?? "0");
    if (Number.isFinite(scale) && scale !== 0) value *= 10 ** scale;
    if (attrs.sign === "-") value *= -1;

    facts.push({ name, contextRef, value });
  }

  return buildFinancials(facts, contexts);
}

function parseStandardFacts(text: string): NumericFact[] {
  const facts: NumericFact[] = [];
  const regex = /<([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b([^>]*)>([^<]*)<\/\1>/g;

  for (const match of text.matchAll(regex)) {
    const attrs = parseAttributes(match[2]);
    const contextRef = attrs.contextref;
    if (!contextRef || attrs.nil === "true") continue;

    const raw = decodeXml(match[3]).replace(/,/g, "").trim();
    if (!raw) continue;

    let value = Number(raw);
    if (!Number.isFinite(value)) continue;

    const scale = Number(attrs.scale ?? "0");
    if (Number.isFinite(scale) && scale !== 0) value *= 10 ** scale;
    if (attrs.sign === "-") value *= -1;

    facts.push({ name: match[1], contextRef, value });
  }

  return facts;
}

function parseContexts(text: string): Map<string, ContextInfo> {
  const contexts = new Map<string, ContextInfo>();
  const regex = /<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi;

  for (const match of text.matchAll(regex)) {
    const attrs = parseAttributes(match[1]);
    const id = attrs.id;
    if (!id) continue;

    const body = match[2];
    const startDate = firstTagText(body, "xbrli:startDate");
    const endDate = firstTagText(body, "xbrli:endDate");
    const instant = firstTagText(body, "xbrli:instant");
    const normalizedId = id.toLowerCase();
    const normalizedBody = body.toLowerCase();

    contexts.set(id, {
      id,
      startDate,
      endDate,
      instant,
      consolidated:
        normalizedId.includes("consolidated") ||
        normalizedBody.includes("consolidatedmember") ||
        normalizedBody.includes("consolidated"),
      currentYear:
        normalizedId.includes("currentyear") ||
        normalizedId.includes("currentperiod") ||
        normalizedId.includes("currentfiscalyear"),
      priorYear:
        normalizedId.includes("prioryear") ||
        normalizedId.includes("previousyear") ||
        normalizedId.includes("priorperiod") ||
        normalizedId.includes("previousfiscalyear"),
    });
  }

  return contexts;
}

function buildFinancials(facts: NumericFact[], contexts: Map<string, ContextInfo>): Financials {
  const durationContext = bestContext(contexts, "duration");
  const instantContext = bestContext(contexts, "instant");

  const result: Financials = {
    revenue: extractMetric(facts, contexts, durationContext, METRICS.revenue),
    operatingIncome: extractMetric(facts, contexts, durationContext, METRICS.operatingIncome),
    operatingCF: extractMetric(facts, contexts, durationContext, METRICS.operatingCF),
    cash: extractMetric(facts, contexts, instantContext, METRICS.cash),
    currentAssets: extractMetric(facts, contexts, instantContext, METRICS.currentAssets),
    currentLiabilities: extractMetric(facts, contexts, instantContext, METRICS.currentLiabilities),
    assets: extractMetric(facts, contexts, instantContext, METRICS.assets),
    netAssets: extractMetric(facts, contexts, instantContext, METRICS.netAssets),
  };

  const periodEnd = durationContext?.endDate ?? instantContext?.instant;
  if (periodEnd) {
    const date = new Date(`${periodEnd}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      result.periodEnd = periodEnd;
      result.fiscalYear = date.getUTCFullYear();
      result.fiscalMonth = date.getUTCMonth() + 1;
      result.fiscalPeriod = `${result.fiscalYear}年${result.fiscalMonth}月期`;
    }
  }

  return result;
}

function bestContext(
  contexts: Map<string, ContextInfo>,
  kind: "duration" | "instant"
): ContextInfo | undefined {
  return [...contexts.values()]
    .filter((context) =>
      kind === "duration"
        ? Boolean(context.startDate && context.endDate)
        : Boolean(context.instant)
    )
    .sort((a, b) => contextScore(b) - contextScore(a))[0];
}

function contextScore(context: ContextInfo) {
  let score = 0;
  if (context.currentYear) score += 100;
  if (context.consolidated) score += 30;
  if (context.priorYear) score -= 100;
  if (/^CurrentYear(?:Consolidated)?(?:Duration|Instant)$/i.test(context.id)) score += 50;
  return score;
}

function extractMetric(
  facts: NumericFact[],
  contexts: Map<string, ContextInfo>,
  preferredContext: ContextInfo | undefined,
  definition: MetricDefinition
): number {
  const exactNames = new Set(definition.exact.map(normalizeName));
  const contains = (definition.contains ?? []).map(normalizeName);
  const excludes = (definition.excludes ?? []).map(normalizeName);

  const candidates = facts
    .map((fact) => {
      const normalized = normalizeName(localName(fact.name));
      const exact = exactNames.has(normalized);
      const fuzzy = !exact && contains.some((token) => normalized.includes(token));
      if (!exact && !fuzzy) return null;
      if (excludes.some((token) => normalized.includes(token))) return null;

      const context = contexts.get(fact.contextRef);
      const preferred = preferredContext && fact.contextRef === preferredContext.id ? 1000 : 0;
      const nameScore = exact ? 500 : 100;
      const nonZeroScore = fact.value !== 0 ? 20 : 0;
      return {
        fact,
        score: preferred + nameScore + nonZeroScore + contextScoreSafe(context),
      };
    })
    .filter((candidate): candidate is { fact: NumericFact; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.fact.value ?? 0;
}

function normalizeName(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function contextScoreSafe(context: ContextInfo | undefined) {
  return context ? contextScore(context) : -1000;
}

function localName(name: string) {
  return name.includes(":") ? name.split(":").at(-1)! : name;
}

function firstTagText(text: string, tagName: string) {
  const regex = new RegExp(`<${escapeRegExp(tagName)}[^>]*>([^<]+)<\\/${escapeRegExp(tagName)}>`, "i");
  return text.match(regex)?.[1]?.trim();
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  const regex = /([:\w.-]+)\s*=\s*["']([^"']*)["']/g;
  for (const match of source.matchAll(regex)) {
    attributes[match[1].toLowerCase()] = decodeXml(match[2]);
  }
  return attributes;
}

function decodeXml(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
