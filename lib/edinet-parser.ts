import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

export type FinancialMetricProfile =
  | "general"
  | "bank"
  | "securities"
  | "insurance"
  | "special-finance"
  | "commodity"
  | "ifrs"
  | "insurance-ifrs"
  | "operating-revenue";

export type EdinetFinancials = {
  revenue: number;
  grossProfit: number | null;
  netIncome: number | null;
  operatingIncome: number;
  operatingCF: number;
  cash: number;
  currentAssets: number;
  currentLiabilities: number;
  assets: number;
  netAssets: number;
  financialProfile: FinancialMetricProfile;
  revenueLabel: string;
  operatingIncomeLabel: string;
  currentRatioApplicable: boolean;
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

type ProfileDefinition = {
  revenueElements: string[];
  operatingIncomeElements: string[];
  cashElements: string[];
  revenueLabel: string;
  operatingIncomeLabel: string;
  currentRatioApplicable: boolean;
};

const PROFILE_DEFINITIONS: Record<FinancialMetricProfile, ProfileDefinition> = {
  general: {
    revenueElements: [
      "NetSales",
      "Sales",
      "Revenue",
      "Revenues",
      "OperatingRevenue",
      "BusinessRevenue",
      "SalesRevenue",
    ],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingIncomeLoss",
      "ProfitLossFromOperatingActivities",
    ],
    cashElements: ["CashAndCashEquivalents", "CashAndDeposits"],
    revenueLabel: "売上高",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
  },
  ifrs: {
    revenueElements: [
      "RevenueIFRSSummaryOfBusinessResults",
      "Revenue2IFRS",
      "RevenueIFRS",
      "RevenueFromExternalCustomers2IFRS",
      "OperatingRevenueIFRS",
    ],
    operatingIncomeElements: [
      "OperatingProfitLossIFRSKeyFinancialData",
      "OperatingProfitLossIFRS",
      "OperatingProfitIFRS",
      "OperatingIncomeLossUSGAAPSummaryOfBusinessResults",
    ],
    cashElements: [
      "CashAndCashEquivalentsIFRS",
      "CashAndCashEquivalents",
      "CashAndDeposits",
    ],
    revenueLabel: "売上収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
  },
  "insurance-ifrs": {
    revenueElements: [
      "Revenue2IFRS",
      "InsuranceRevenueIFRSKeyFinancialData",
      "InsuranceRevenueIFRS",
      "RevenueIFRSSummaryOfBusinessResults",
    ],
    operatingIncomeElements: [
      "ProfitLossBeforeTaxIFRSSummaryOfBusinessResults",
      "ProfitLossBeforeTaxIFRS",
    ],
    cashElements: [
      "CashAndCashEquivalentsIFRS",
      "CashAndCashEquivalents",
      "CashAndDepositsAssetsINS",
      "CashAndDeposits",
    ],
    revenueLabel: "収益",
    operatingIncomeLabel: "税引前利益",
    currentRatioApplicable: false,
  },
  "operating-revenue": {
    revenueElements: [
      "OperatingRevenue1SummaryOfBusinessResults",
      "OperatingRevenue1",
      "OperatingRevenueIVT",
      "OperatingRevenues",
      "OperatingRevenue",
    ],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingIncomeLoss",
      "OrdinaryIncomeLossSummaryOfBusinessResults",
      "OrdinaryIncome",
    ],
    cashElements: ["CashAndCashEquivalents", "CashAndDeposits"],
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
  },
  bank: {
    revenueElements: [
      "OrdinaryIncomeBNK",
      "OperatingRevenueBNK",
      "NetSales",
      "Revenue",
    ],
    // 銀行業には営業利益の概念がないため、経常利益を比較利益として使用する。
    operatingIncomeElements: [
      "OrdinaryIncomeLossSummaryOfBusinessResults",
      "OrdinaryIncome",
      "ProfitLoss",
    ],
    cashElements: [
      "CashAndCashEquivalents",
      "CashAndDueFromBanksAssetsBNK",
      "CashAndDeposits",
    ],
    revenueLabel: "経常収益",
    operatingIncomeLabel: "経常利益",
    currentRatioApplicable: false,
  },
  securities: {
    revenueElements: [
      "OperatingRevenueSEC",
      "NetOperatingRevenueSEC",
      "OperatingRevenue",
      "Revenue",
    ],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OrdinaryIncome",
    ],
    cashElements: ["CashAndCashEquivalents", "CashAndDeposits"],
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
  },
  insurance: {
    // 保険業タクソノミでは OperatingIncomeINS が「経常収益」を表す。
    revenueElements: [
      "OrdinaryIncomeSummaryOfBusinessResults",
      "OperatingIncomeINS",
      "OperatingRevenueINS",
      "Revenue",
    ],
    // 保険業には営業利益の概念がないため、経常利益を比較利益として使用する。
    operatingIncomeElements: [
      "OrdinaryIncomeLossSummaryOfBusinessResults",
      "OrdinaryIncome",
      "ProfitLoss",
    ],
    cashElements: [
      "CashAndCashEquivalents",
      "CashAndDepositsAssetsINS",
      "CashAndDeposits",
    ],
    revenueLabel: "経常収益",
    operatingIncomeLabel: "経常利益",
    currentRatioApplicable: false,
  },
  "special-finance": {
    revenueElements: ["OperatingRevenueSPF", "OperatingRevenue", "Revenue"],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OrdinaryIncome",
    ],
    cashElements: ["CashAndCashEquivalents", "CashAndDeposits"],
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
  },
  commodity: {
    revenueElements: ["OperatingRevenueCMD", "OperatingRevenue", "Revenue"],
    operatingIncomeElements: [
      "OperatingIncome",
      "OperatingProfit",
      "OrdinaryIncome",
    ],
    cashElements: ["CashAndCashEquivalents", "CashAndDeposits"],
    revenueLabel: "営業収益",
    operatingIncomeLabel: "営業利益",
    currentRatioApplicable: true,
  },
};

export function parseEdinetFinancials(docID: string): EdinetFinancials {
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
    ? parseEdinetFinancialsFromXbrl(xbrlEntry.getData().toString("utf8"))
    : emptyFinancials();

  const fromInline = htmEntries.reduce<EdinetFinancials>((merged, entry) => {
    const parsed = parseInlineXbrl(entry.getData().toString("utf8"));
    return mergeFinancials(merged, parsed);
  }, emptyFinancials());

  return mergeFinancials(fromXbrl, fromInline);
}

export function parseEdinetFinancialsFromXbrl(text: string): EdinetFinancials {
  const contexts = parseContexts(text);
  const facts = parseStandardFacts(text);
  return buildFinancials(facts, contexts);
}

function emptyFinancials(): EdinetFinancials {
  return {
    revenue: 0,
    grossProfit: null,
    netIncome: null,
    operatingIncome: 0,
    operatingCF: 0,
    cash: 0,
    currentAssets: 0,
    currentLiabilities: 0,
    assets: 0,
    netAssets: 0,
    financialProfile: "general",
    revenueLabel: PROFILE_DEFINITIONS.general.revenueLabel,
    operatingIncomeLabel: PROFILE_DEFINITIONS.general.operatingIncomeLabel,
    currentRatioApplicable: PROFILE_DEFINITIONS.general.currentRatioApplicable,
  };
}

function mergeFinancials(
  primary: EdinetFinancials,
  fallback: EdinetFinancials
): EdinetFinancials {
  const financialProfile =
    primary.financialProfile !== "general"
      ? primary.financialProfile
      : fallback.financialProfile;
  const definition = PROFILE_DEFINITIONS[financialProfile];

  return {
    revenue: chooseNumber(primary.revenue, fallback.revenue),
    grossProfit: chooseNullableNumber(primary.grossProfit, fallback.grossProfit),
    netIncome: chooseNullableNumber(primary.netIncome, fallback.netIncome),
    operatingIncome: chooseNumber(primary.operatingIncome, fallback.operatingIncome),
    operatingCF: chooseNumber(primary.operatingCF, fallback.operatingCF),
    cash: chooseNumber(primary.cash, fallback.cash),
    currentAssets: chooseNumber(primary.currentAssets, fallback.currentAssets),
    currentLiabilities: chooseNumber(primary.currentLiabilities, fallback.currentLiabilities),
    assets: chooseNumber(primary.assets, fallback.assets),
    netAssets: chooseNumber(primary.netAssets, fallback.netAssets),
    financialProfile,
    revenueLabel: definition.revenueLabel,
    operatingIncomeLabel: definition.operatingIncomeLabel,
    currentRatioApplicable: definition.currentRatioApplicable,
    periodEnd: primary.periodEnd ?? fallback.periodEnd,
    fiscalYear: primary.fiscalYear ?? fallback.fiscalYear,
    fiscalMonth: primary.fiscalMonth ?? fallback.fiscalMonth,
    fiscalPeriod: primary.fiscalPeriod ?? fallback.fiscalPeriod,
  };
}

function chooseNumber(primary: number, fallback: number) {
  return primary !== 0 ? primary : fallback;
}

function chooseNullableNumber(
  primary: number | null,
  fallback: number | null
) {
  return primary !== null ? primary : fallback;
}

function parseInlineXbrl(text: string): EdinetFinancials {
  const contexts = parseContexts(text);
  const facts: NumericFact[] = [];
  const regex = /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi;

  for (const match of text.matchAll(regex)) {
    const attrs = parseAttributes(match[1]);
    const name = attrs.name;
    const contextRef = attrs.contextref;
    if (!name || !contextRef) continue;

    const rawText = decodeXml(match[2].replace(/<[^>]+>/g, ""))
      .replace(/,/g, "")
      .trim();
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

function buildFinancials(
  facts: NumericFact[],
  contexts: Map<string, ContextInfo>
): EdinetFinancials {
  const durationContext = bestContext(contexts, "duration");
  const instantContext = bestContext(contexts, "instant");
  const financialProfile = detectFinancialProfile(facts);
  const definition = PROFILE_DEFINITIONS[financialProfile];

  const result: EdinetFinancials = {
    revenue: extractFact(
      facts,
      contexts,
      durationContext,
      definition.revenueElements
    ),
    grossProfit: extractNullableFact(
      facts,
      contexts,
      durationContext,
      [
        "GrossProfitSummaryOfBusinessResults",
        "GrossProfitLossSummaryOfBusinessResults",
        "GrossProfit",
        "GrossProfitLoss",
        "GrossProfitIFRS",
        "GrossProfitLossIFRS",
      ]
    ),
    netIncome: extractNullableFact(
      facts,
      contexts,
      durationContext,
      [
        "ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults",
        "ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults",
        "ProfitLossAttributableToOwnersOfParent",
        "ProfitAttributableToOwnersOfParent",
        "ProfitLossAttributableToOwnersOfParentIFRS",
        "ProfitAttributableToOwnersOfParentIFRS",
        "NetIncomeSummaryOfBusinessResults",
        "NetIncome",
        "NetIncomeLoss",
        "ProfitLoss",
      ]
    ),
    operatingIncome: extractFact(
      facts,
      contexts,
      durationContext,
      definition.operatingIncomeElements
    ),
    operatingCF: extractFact(facts, contexts, durationContext, [
      "CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults",
      "NetCashProvidedByUsedInOperatingActivitiesIFRS",
      "NetCashProvidedByUsedInOperatingActivities",
      "CashFlowsFromUsedInOperatingActivities",
      "NetCashProvidedByOperatingActivities",
    ]),
    cash: extractFact(facts, contexts, instantContext, definition.cashElements),
    currentAssets: definition.currentRatioApplicable
      ? extractFact(facts, contexts, instantContext, ["CurrentAssets"])
      : 0,
    currentLiabilities: definition.currentRatioApplicable
      ? extractFact(facts, contexts, instantContext, ["CurrentLiabilities"])
      : 0,
    assets: extractFact(facts, contexts, instantContext, [
      "TotalAssetsSummaryOfBusinessResults",
      "AssetsIFRS",
      "TotalAssetsIFRS",
      "Assets",
      "TotalAssets",
    ]),
    netAssets: extractFact(facts, contexts, instantContext, [
      "NetAssets",
      "Equity",
      "TotalEquity",
      "EquityAttributableToOwnersOfParent",
      "EquityAttributableToOwnersOfParentIFRS",
      "EquityIFRS",
      "TotalEquityIFRS",
    ]),
    financialProfile,
    revenueLabel: definition.revenueLabel,
    operatingIncomeLabel: definition.operatingIncomeLabel,
    currentRatioApplicable: definition.currentRatioApplicable,
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

function detectFinancialProfile(facts: NumericFact[]): FinancialMetricProfile {
  const elements = new Set(facts.map((fact) => localName(fact.name)));

  if (
    elements.has("OrdinaryIncomeBNK") ||
    elements.has("CashAndDueFromBanksAssetsBNK")
  ) {
    return "bank";
  }

  const insuranceMarkers = [
    "OperatingIncomeINS",
    "CashAndDepositsAssetsINS",
    "InsuranceRevenueIFRSKeyFinancialData",
    "InsuranceRevenueIFRS",
    "NetPremiumsWrittenSummaryOfBusinessResultsINS",
  ];
  if (insuranceMarkers.some((element) => elements.has(element))) {
    return elements.has("OrdinaryIncomeSummaryOfBusinessResults")
      ? "insurance"
      : "insurance-ifrs";
  }

  if (
    elements.has("OperatingRevenueSEC") ||
    elements.has("NetOperatingRevenueSEC")
  ) {
    return "securities";
  }
  if (elements.has("OperatingRevenueSPF")) return "special-finance";
  if (elements.has("OperatingRevenueCMD")) return "commodity";

  if (
    elements.has("RevenueIFRSSummaryOfBusinessResults") ||
    elements.has("Revenue2IFRS") ||
    elements.has("RevenueIFRS") ||
    elements.has("OperatingProfitLossIFRS")
  ) {
    return "ifrs";
  }

  if (
    elements.has("OperatingRevenue1SummaryOfBusinessResults") ||
    elements.has("OperatingRevenue1") ||
    elements.has("OperatingRevenueIVT") ||
    elements.has("OperatingRevenues")
  ) {
    return "operating-revenue";
  }

  return "general";
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
  if (/^CurrentYear(?:Consolidated)?(?:Duration|Instant)$/i.test(context.id)) {
    score += 50;
  }
  return score;
}

function extractFact(
  facts: NumericFact[],
  contexts: Map<string, ContextInfo>,
  preferredContext: ContextInfo | undefined,
  suffixes: string[]
): number {
  const rank = new Map(suffixes.map((suffix, index) => [suffix, index]));
  const candidates = facts
    .filter((fact) => rank.has(localName(fact.name)))
    .map((fact) => ({ fact, context: contexts.get(fact.contextRef) }))
    .sort((a, b) => {
      const score = (candidate: {
        fact: NumericFact;
        context: ContextInfo | undefined;
      }) => {
        const preferred =
          preferredContext && candidate.fact.contextRef === preferredContext.id
            ? 10_000
            : 0;
        const elementRank = rank.get(localName(candidate.fact.name)) ?? suffixes.length;
        const elementPriority = (suffixes.length - elementRank) * 10;
        return preferred + contextScoreSafe(candidate.context) * 10 + elementPriority;
      };

      return score(b) - score(a);
    });

  return candidates[0]?.fact.value ?? 0;
}

function extractNullableFact(
  facts: NumericFact[],
  contexts: Map<string, ContextInfo>,
  preferredContext: ContextInfo | undefined,
  suffixes: string[]
): number | null {
  const rank = new Map(suffixes.map((suffix, index) => [suffix, index]));
  const candidates = facts
    .filter((fact) => rank.has(localName(fact.name)))
    .map((fact) => ({ fact, context: contexts.get(fact.contextRef) }))
    .sort((a, b) => {
      const score = (candidate: {
        fact: NumericFact;
        context: ContextInfo | undefined;
      }) => {
        const preferred =
          preferredContext && candidate.fact.contextRef === preferredContext.id
            ? 10_000
            : 0;
        const elementRank =
          rank.get(localName(candidate.fact.name)) ?? suffixes.length;
        const elementPriority = (suffixes.length - elementRank) * 10;
        return preferred + contextScoreSafe(candidate.context) * 10 + elementPriority;
      };

      return score(b) - score(a);
    });

  return candidates[0]?.fact.value ?? null;
}

function contextScoreSafe(context: ContextInfo | undefined) {
  return context ? contextScore(context) : -1000;
}

function localName(name: string) {
  return name.includes(":") ? name.split(":").at(-1)! : name;
}

function firstTagText(text: string, tagName: string) {
  const regex = new RegExp(
    `<${escapeRegExp(tagName)}[^>]*>([^<]+)<\\/${escapeRegExp(tagName)}>` ,
    "i"
  );
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
