import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

type Financials = {
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
        normalizedBody.includes("consolidatedmember"),
      currentYear:
        normalizedId.includes("currentyear") ||
        normalizedId.includes("currentperiod"),
      priorYear:
        normalizedId.includes("prioryear") ||
        normalizedId.includes("previousyear") ||
        normalizedId.includes("priorperiod"),
    });
  }

  return contexts;
}

function buildFinancials(facts: NumericFact[], contexts: Map<string, ContextInfo>): Financials {
  const durationContext = bestContext(contexts, "duration");
  const instantContext = bestContext(contexts, "instant");

  const result: Financials = {
    revenue: extractFact(facts, contexts, durationContext, [
      "NetSales",
      "Sales",
      "Revenue",
      "OperatingRevenue",
      "BusinessRevenue",
    ]),
    operatingIncome: extractFact(facts, contexts, durationContext, [
      "OperatingIncome",
      "OperatingProfit",
    ]),
    operatingCF: extractFact(facts, contexts, durationContext, [
      "NetCashProvidedByUsedInOperatingActivities",
    ]),
    cash: extractFact(facts, contexts, instantContext, [
      "CashAndCashEquivalents",
      "CashAndDeposits",
    ]),
    currentAssets: extractFact(facts, contexts, instantContext, ["CurrentAssets"]),
    currentLiabilities: extractFact(facts, contexts, instantContext, ["CurrentLiabilities"]),
    assets: extractFact(facts, contexts, instantContext, ["Assets", "TotalAssets"]),
    netAssets: extractFact(facts, contexts, instantContext, ["NetAssets", "Equity"]),
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

function extractFact(
  facts: NumericFact[],
  contexts: Map<string, ContextInfo>,
  preferredContext: ContextInfo | undefined,
  suffixes: string[]
): number {
  const candidates = facts
    .filter((fact) => suffixes.some((suffix) => localName(fact.name) === suffix))
    .map((fact) => ({ fact, context: contexts.get(fact.contextRef) }))
    .sort((a, b) => {
      const aPreferred = preferredContext && a.fact.contextRef === preferredContext.id ? 1000 : 0;
      const bPreferred = preferredContext && b.fact.contextRef === preferredContext.id ? 1000 : 0;
      return bPreferred + contextScoreSafe(b.context) - (aPreferred + contextScoreSafe(a.context));
    });

  return candidates[0]?.fact.value ?? 0;
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
