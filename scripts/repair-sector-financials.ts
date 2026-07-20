import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Profile = "general" | "bank" | "insurance" | "foreign";

type ContextInfo = {
  id: string;
  startDate?: string;
  endDate?: string;
  instant?: string;
  consolidated: boolean;
  current: boolean;
  prior: boolean;
};

type Fact = {
  name: string;
  contextRef: string;
  value: number;
};

type AnalysisRow = {
  ticker: string;
  company_name: string;
  doc_id: string;
  financials: Record<string, unknown> | null;
  history: Array<Record<string, unknown>> | null;
};

type CompanyRow = {
  id: string;
  ticker: string;
  company_name: string;
  industry_name: string | null;
  is_financial: boolean;
};

type Extracted = {
  profile: Profile;
  revenue: number;
  operatingIncome: number;
  operatingCF: number;
  cash: number;
  assets: number;
  liabilities: number;
  netAssets: number;
  currentAssets?: number;
  currentLiabilities?: number;
  ordinaryIncome?: number;
  ordinaryProfit?: number;
  loans?: number;
  deposits?: number;
  securities?: number;
  insuranceRevenue?: number;
  policyReserves?: number;
  periodEnd?: string;
  fiscalYear?: number;
  fiscalMonth?: number;
  fiscalPeriod?: string;
  metricLabels: Record<string, string>;
};

type MetricRule = {
  exact: string[];
  contains?: string[];
  excludes?: string[];
  kind: "duration" | "instant";
};

const COMMON_RULES: Record<string, MetricRule> = {
  revenue: {
    kind: "duration",
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
      "RevenueFromContractsWithCustomers",
      "RevenueFromContractsWithCustomersExcludingAssessedTax",
    ],
    contains: ["revenue", "netsales", "salesrevenue"],
    excludes: ["cost", "segment", "geographic", "forecast", "pershare"],
  },
  operatingIncome: {
    kind: "duration",
    exact: [
      "OperatingIncome",
      "OperatingProfit",
      "OperatingProfitLoss",
      "OperatingProfitLossIFRS",
      "OperatingIncomeLoss",
    ],
    contains: ["operatingincome", "operatingprofit", "operatingloss"],
    excludes: ["segment", "forecast", "pershare"],
  },
  operatingCF: {
    kind: "duration",
    exact: [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashFlowsFromUsedInOperatingActivities",
      "CashFlowsFromUsedInOperatingActivities",
      "CashFlowsFromUsedInOperatingActivitiesIFRS",
    ],
    contains: ["cashprovidedbyusedinoperatingactivities", "cashflowsfromusedinoperatingactivities"],
    excludes: ["continuingoperations", "discontinuedoperations"],
  },
  cash: {
    kind: "instant",
    exact: [
      "CashAndCashEquivalents",
      "CashAndCashEquivalentsIFRS",
      "CashAndCashEquivalentsAtCarryingValue",
      "CashAndDeposits",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    ],
    contains: ["cashandcashequivalents", "cashanddeposits", "cashandduefrombanks"],
    excludes: ["increase", "decrease", "change", "effect", "beginning"],
  },
  currentAssets: {
    kind: "instant",
    exact: ["CurrentAssets", "CurrentAssetsIFRS", "AssetsCurrent"],
    contains: ["currentassets", "assetscurrent"],
    excludes: ["noncurrent", "segment"],
  },
  currentLiabilities: {
    kind: "instant",
    exact: ["CurrentLiabilities", "CurrentLiabilitiesIFRS", "LiabilitiesCurrent"],
    contains: ["currentliabilities", "liabilitiescurrent"],
    excludes: ["noncurrent", "segment"],
  },
  assets: {
    kind: "instant",
    exact: ["Assets", "AssetsIFRS", "TotalAssets"],
    contains: ["totalassets"],
    excludes: ["current", "noncurrent", "segment", "average", "returnon"],
  },
  liabilities: {
    kind: "instant",
    exact: ["Liabilities", "LiabilitiesIFRS", "TotalLiabilities"],
    contains: ["totalliabilities"],
    excludes: ["current", "noncurrent", "segment", "ratio"],
  },
  netAssets: {
    kind: "instant",
    exact: [
      "NetAssets",
      "Equity",
      "EquityIFRS",
      "StockholdersEquity",
      "EquityAttributableToOwnersOfParent",
      "EquityAttributableToOwnersOfParentIFRS",
    ],
    contains: ["netassets", "stockholdersequity", "equityattributabletoownersofparent"],
    excludes: ["ratio", "pershare", "segment", "average", "returnon"],
  },
};

const BANK_RULES: Record<string, MetricRule> = {
  ordinaryIncome: {
    kind: "duration",
    exact: ["OrdinaryIncome", "OrdinaryIncomeBanking", "OperatingIncomeBanking"],
    contains: ["ordinaryincome", "operatingincomebanking"],
    excludes: ["pershare", "forecast", "nonconsolidated"],
  },
  ordinaryProfit: {
    kind: "duration",
    exact: ["OrdinaryProfit", "OrdinaryProfitLoss"],
    contains: ["ordinaryprofit"],
    excludes: ["pershare", "forecast", "nonconsolidated"],
  },
  loans: {
    kind: "instant",
    exact: ["LoansAndBillsDiscounted", "LoansAndBillsDiscountedBanking"],
    contains: ["loansandbillsdiscounted", "loansreceivable"],
    excludes: ["allowance", "average", "ratio"],
  },
  deposits: {
    kind: "instant",
    exact: ["Deposits", "DepositsBanking"],
    contains: ["depositsbanking", "deposits"],
    excludes: ["cashanddeposits", "average", "ratio", "interest"],
  },
  securities: {
    kind: "instant",
    exact: ["Securities", "SecuritiesBanking", "InvestmentSecurities"],
    contains: ["securitiesbanking", "investmentsecurities"],
    excludes: ["valuation", "gain", "loss", "average", "ratio"],
  },
};

const INSURANCE_RULES: Record<string, MetricRule> = {
  insuranceRevenue: {
    kind: "duration",
    exact: [
      "InsuranceRevenue",
      "InsuranceRevenueIFRS",
      "PremiumIncome",
      "InsurancePremiumsAndOther",
      "InsurancePremiumAndOtherIncome",
      "OrdinaryIncomeInsurance",
    ],
    contains: ["insurancerevenue", "premiumincome", "insurancepremium", "ordinaryincomeinsurance"],
    excludes: ["expense", "ceded", "forecast", "pershare"],
  },
  ordinaryProfit: {
    kind: "duration",
    exact: ["OrdinaryProfit", "OrdinaryProfitLoss"],
    contains: ["ordinaryprofit"],
    excludes: ["forecast", "pershare", "nonconsolidated"],
  },
  policyReserves: {
    kind: "instant",
    exact: ["PolicyReserves", "PolicyReserve", "InsuranceContractLiabilities"],
    contains: ["policyreserve", "insurancecontractliabilit"],
    excludes: ["change", "expense", "income", "ratio"],
  },
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const onlyTicker = argValue("ticker")?.trim().toUpperCase() || "";
const reportPathArg = argValue("report")?.trim() || "";
const concurrency = Math.max(1, Number(argValue("concurrency") || "2"));

function localName(name: string) {
  return name.includes(":") ? name.split(":").at(-1)! : name;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
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

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  const regex = /([:\w.-]+)\s*=\s*["']([^"']*)["']/g;
  for (const match of source.matchAll(regex)) {
    attributes[match[1].toLowerCase()] = decodeXml(match[2]);
  }
  return attributes;
}

function firstTagText(text: string, tagName: string) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`<${escaped}[^>]*>([^<]+)<\\/${escaped}>`, "i"))?.[1]?.trim();
}

function parseContexts(text: string) {
  const contexts = new Map<string, ContextInfo>();
  const regex = /<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi;
  for (const match of text.matchAll(regex)) {
    const attrs = parseAttributes(match[1]);
    const id = attrs.id;
    if (!id) continue;
    const body = match[2];
    const n = normalize(`${id} ${body}`);
    contexts.set(id, {
      id,
      startDate: firstTagText(body, "xbrli:startDate"),
      endDate: firstTagText(body, "xbrli:endDate"),
      instant: firstTagText(body, "xbrli:instant"),
      consolidated: n.includes("consolidated") || n.includes("consolidatedmember"),
      current: n.includes("currentyear") || n.includes("currentperiod") || n.includes("currentfiscalyear"),
      prior: n.includes("prioryear") || n.includes("previousyear") || n.includes("priorperiod"),
    });
  }
  return contexts;
}

function parseFacts(text: string) {
  const facts: Fact[] = [];
  const standard = /<([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b([^>]*)>([^<]*)<\/\1>/g;
  for (const match of text.matchAll(standard)) {
    const attrs = parseAttributes(match[2]);
    if (!attrs.contextref || attrs.nil === "true") continue;
    const raw = decodeXml(match[3]).replace(/,/g, "").trim();
    if (!raw) continue;
    let value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const scale = Number(attrs.scale ?? "0");
    if (Number.isFinite(scale) && scale !== 0) value *= 10 ** scale;
    if (attrs.sign === "-") value *= -1;
    facts.push({ name: match[1], contextRef: attrs.contextref, value });
  }

  const inline = /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi;
  for (const match of text.matchAll(inline)) {
    const attrs = parseAttributes(match[1]);
    if (!attrs.name || !attrs.contextref || attrs.nil === "true") continue;
    const raw = decodeXml(match[2].replace(/<[^>]+>/g, "")).replace(/,/g, "").trim();
    if (!raw) continue;
    let value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const scale = Number(attrs.scale ?? "0");
    if (Number.isFinite(scale) && scale !== 0) value *= 10 ** scale;
    if (attrs.sign === "-") value *= -1;
    facts.push({ name: attrs.name, contextRef: attrs.contextref, value });
  }
  return facts;
}

function contextScore(context: ContextInfo | undefined, kind: "duration" | "instant") {
  if (!context) return -10000;
  if (kind === "duration" && !(context.startDate && context.endDate)) return -10000;
  if (kind === "instant" && !context.instant) return -10000;
  let score = 0;
  if (context.current) score += 500;
  if (context.consolidated) score += 200;
  if (context.prior) score -= 500;
  return score;
}

function extract(facts: Fact[], contexts: Map<string, ContextInfo>, rule: MetricRule) {
  const exact = new Set(rule.exact.map(normalize));
  const contains = (rule.contains ?? []).map(normalize);
  const excludes = (rule.excludes ?? []).map(normalize);
  const candidates = facts
    .map((fact) => {
      const name = normalize(localName(fact.name));
      if (excludes.some((x) => name.includes(x))) return null;
      const exactMatch = exact.has(name);
      const containsMatch = contains.some((x) => name.includes(x));
      if (!exactMatch && !containsMatch) return null;
      const context = contexts.get(fact.contextRef);
      const score = contextScore(context, rule.kind) + (exactMatch ? 1000 : 0) + Math.min(Math.abs(fact.value) > 0 ? 20 : 0, 20);
      return { fact, context, score };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.score - a.score || Math.abs(b.fact.value) - Math.abs(a.fact.value));
  return candidates[0]?.fact.value ?? 0;
}

function detectProfile(company: CompanyRow): Profile {
  const source = `${company.company_name} ${company.industry_name ?? ""}`;
  if (/銀行|信用金庫|Bank/i.test(source)) return "bank";
  if (/保険|生命|損害|Insurance/i.test(source)) return "insurance";
  if (/JDR|リミテッド|インク|コーポレーション|バーハッド/i.test(source)) return "foreign";
  return company.is_financial ? "bank" : "general";
}

function readDocument(docID: string) {
  const zipPath = path.join(process.cwd(), "downloads", `${docID}.zip`);
  if (!fs.existsSync(zipPath)) throw new Error(`ZIPなし: ${docID}`);
  const zip = new AdmZip(zipPath);
  const texts = zip
    .getEntries()
    .filter((entry) => entry.entryName.startsWith("XBRL/PublicDoc/") && /\.(xbrl|htm)$/i.test(entry.entryName))
    .map((entry) => entry.getData().toString("utf8"));
  if (texts.length === 0) throw new Error(`XBRLなし: ${docID}`);
  const contexts = new Map<string, ContextInfo>();
  const facts: Fact[] = [];
  for (const text of texts) {
    for (const [id, context] of parseContexts(text)) contexts.set(id, context);
    facts.push(...parseFacts(text));
  }
  return { contexts, facts };
}

function extractDocument(docID: string, profile: Profile): Extracted {
  const { contexts, facts } = readDocument(docID);
  const common = Object.fromEntries(
    Object.entries(COMMON_RULES).map(([key, rule]) => [key, extract(facts, contexts, rule)])
  ) as Record<string, number>;

  const bestDuration = [...contexts.values()]
    .filter((x) => x.startDate && x.endDate)
    .sort((a, b) => contextScore(b, "duration") - contextScore(a, "duration"))[0];
  const bestInstant = [...contexts.values()]
    .filter((x) => x.instant)
    .sort((a, b) => contextScore(b, "instant") - contextScore(a, "instant"))[0];
  const periodEnd = bestDuration?.endDate ?? bestInstant?.instant;
  const date = periodEnd ? new Date(`${periodEnd}T00:00:00Z`) : null;

  let result: Extracted = {
    profile,
    revenue: common.revenue,
    operatingIncome: common.operatingIncome,
    operatingCF: common.operatingCF,
    cash: common.cash,
    currentAssets: common.currentAssets || undefined,
    currentLiabilities: common.currentLiabilities || undefined,
    assets: common.assets,
    liabilities: common.liabilities,
    netAssets: common.netAssets,
    periodEnd,
    fiscalYear: date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : undefined,
    fiscalMonth: date && !Number.isNaN(date.getTime()) ? date.getUTCMonth() + 1 : undefined,
    fiscalPeriod:
      date && !Number.isNaN(date.getTime())
        ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月期`
        : undefined,
    metricLabels: {
      revenue: "売上高",
      operatingIncome: "営業利益",
      operatingCF: "営業CF",
      cash: "現金及び現金同等物",
      assets: "総資産",
      liabilities: "負債",
      netAssets: "純資産",
    },
  };

  if (profile === "bank") {
    const bank = Object.fromEntries(
      Object.entries(BANK_RULES).map(([key, rule]) => [key, extract(facts, contexts, rule)])
    ) as Record<string, number>;
    result = {
      ...result,
      revenue: bank.ordinaryIncome || result.revenue,
      operatingIncome: bank.ordinaryProfit || result.operatingIncome,
      ordinaryIncome: bank.ordinaryIncome || undefined,
      ordinaryProfit: bank.ordinaryProfit || undefined,
      loans: bank.loans || undefined,
      deposits: bank.deposits || undefined,
      securities: bank.securities || undefined,
      metricLabels: {
        revenue: "経常収益",
        operatingIncome: "経常利益",
        operatingCF: "営業CF",
        cash: "現金・預け金",
        assets: "総資産",
        liabilities: "負債",
        netAssets: "純資産",
        loans: "貸出金",
        deposits: "預金",
        securities: "有価証券",
      },
    };
  }

  if (profile === "insurance") {
    const insurance = Object.fromEntries(
      Object.entries(INSURANCE_RULES).map(([key, rule]) => [key, extract(facts, contexts, rule)])
    ) as Record<string, number>;
    result = {
      ...result,
      revenue: insurance.insuranceRevenue || result.revenue,
      operatingIncome: insurance.ordinaryProfit || result.operatingIncome,
      insuranceRevenue: insurance.insuranceRevenue || undefined,
      ordinaryProfit: insurance.ordinaryProfit || undefined,
      policyReserves: insurance.policyReserves || undefined,
      metricLabels: {
        revenue: "保険料等収入",
        operatingIncome: "経常利益",
        operatingCF: "営業CF",
        cash: "現金及び現金同等物",
        assets: "総資産",
        liabilities: "負債",
        netAssets: "純資産",
        policyReserves: "責任準備金等",
      },
    };
  }

  if (!result.liabilities && result.assets && result.netAssets) {
    result.liabilities = result.assets - result.netAssets;
  }

  return result;
}

function requiredFields(profile: Profile) {
  if (profile === "bank") return ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "loans", "deposits"];
  if (profile === "insurance") return ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "policyReserves"];
  return ["revenue", "operatingIncome", "operatingCF", "cash", "assets", "liabilities", "netAssets"];
}

function unresolvedFields(financials: Record<string, unknown>, profile: Profile) {
  return requiredFields(profile).filter((key) => {
    const value = financials[key];
    return typeof value !== "number" || !Number.isFinite(value) || value === 0;
  });
}

function targetTickersFromReport() {
  if (!reportPathArg) return null;
  const report = JSON.parse(fs.readFileSync(reportPathArg, "utf8")) as {
    results?: Array<{ ticker?: string; status?: string }>;
  };
  return new Set(
    (report.results ?? [])
      .filter((row) => row.status === "unresolved" || row.status === "failed")
      .map((row) => row.ticker)
      .filter((x): x is string => Boolean(x))
  );
}

async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const [analyses, companies] = await Promise.all([
    loadAllSupabaseRows<AnalysisRow>(
      "company_analyses",
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, company_name, doc_id, financials, history")
          .range(from, to)
    ),
    loadAllSupabaseRows<CompanyRow>(
      "all_market_companies",
      (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select("id, ticker, company_name, industry_name, is_financial")
          .range(from, to)
    ),
  ]);

  const companyMap = new Map(companies.map((company) => [company.ticker, company]));
  const reportTickers = targetTickersFromReport();
  const targets = analyses.filter((row) => {
    if (!row.doc_id) return false;
    if (onlyTicker && row.ticker.toUpperCase() !== onlyTicker) return false;
    if (reportTickers && !reportTickers.has(row.ticker)) return false;
    if (reportTickers) return true;
    const company = companyMap.get(row.ticker);
    if (!company) return false;
    const profile = detectProfile(company);
    return unresolvedFields(row.financials ?? {}, profile).length > 0;
  });

  console.log("===== 業種別財務データ根本修復 =====");
  console.log({ targets: targets.length, concurrency, report: reportPathArg || null, ticker: onlyTicker || null });

  const results = await mapConcurrent(targets, concurrency, async (row) => {
    const company = companyMap.get(row.ticker);
    if (!company) return { ticker: row.ticker, status: "failed", error: "会社マスタなし" };
    const profile = detectProfile(company);
    try {
      const latest = extractDocument(row.doc_id, profile);
      const latestMissing = unresolvedFields(latest as unknown as Record<string, unknown>, profile);
      if (latestMissing.length > 0) {
        throw new Error(`原本から必須項目を取得できません: ${latestMissing.join(", ")}`);
      }

      const history = [] as Array<Record<string, unknown>>;
      for (const old of row.history ?? []) {
        const docID = String(old.docID ?? old.documentId ?? "");
        if (!docID) continue;
        try {
          const extracted = extractDocument(docID, profile);
          history.push({ ...old, ...extracted, docID });
        } catch {
          history.push(old);
        }
      }

      const { error: analysisError } = await supabaseAdmin
        .from("company_analyses")
        .update({ financials: latest, history })
        .eq("ticker", row.ticker);
      if (analysisError) throw new Error(`company_analyses更新失敗: ${analysisError.message}`);

      const { error: periodError } = await supabaseAdmin
        .from("company_financial_periods")
        .update({ financials: latest, data_quality: "reviewed", updated_at: new Date().toISOString() })
        .eq("company_id", company.id)
        .eq("document_id", row.doc_id);
      if (periodError) throw new Error(`company_financial_periods更新失敗: ${periodError.message}`);

      const { error: companyError } = await supabaseAdmin
        .from("all_market_companies")
        .update({ data_quality: "reviewed", last_financial_update: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", company.id);
      if (companyError) throw new Error(`会社マスタ更新失敗: ${companyError.message}`);

      console.log(`[OK] ${row.ticker} ${row.company_name} (${profile})`);
      return { ticker: row.ticker, companyName: row.company_name, profile, status: "repaired", financials: latest };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FAIL] ${row.ticker} ${row.company_name} (${profile}): ${message}`);
      return { ticker: row.ticker, companyName: row.company_name, profile, status: "failed", error: message };
    }
  });

  const failed = results.filter((row) => row.status === "failed");
  const outputPath = path.join(
    process.cwd(),
    "logs",
    `sector-financial-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), targets: targets.length, repaired: results.length - failed.length, failed: failed.length, results }, null, 2));

  console.log("===== 業種別修復結果 =====");
  console.log({ targets: targets.length, repaired: results.length - failed.length, failed: failed.length, reportPath: outputPath });
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
