import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import AdmZip from "adm-zip";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type Json = Record<string, unknown>;
type MarketRow = { ticker: string; company_name: string | null; industry_name: string | null };
type AnalysisRow = { ticker: string; financials: Json | null; history: Json[] | null };
type Context = { id: string; startDate?: string; endDate?: string; instant?: string; consolidated: boolean; current: boolean; prior: boolean };
type Fact = { name: string; contextRef: string; value: number };

const APPLY = process.argv.includes("--apply");
const FINANCE_INDUSTRIES = ["銀行業", "保険業", "証券、商品先物取引業", "その他金融業"];

const REVENUE_NAMES = [
  "OrdinaryIncomeBNK", "OrdinaryIncomeINS", "OrdinaryIncome",
  "OperatingRevenueSEC", "NetOperatingRevenueSEC", "OperatingRevenue",
  "InsuranceRevenue", "PremiumAndOtherIncome", "TotalIncome",
];
const PROFIT_NAMES = [
  "OrdinaryProfitLossBNK", "OrdinaryProfitBNK",
  "OrdinaryProfitLossINS", "OrdinaryProfitINS",
  "OrdinaryProfitLossSEC", "OrdinaryProfitSEC",
  "OrdinaryProfitLoss", "OrdinaryProfit",
];
const OPERATING_CF_NAMES = [
  "NetCashProvidedByUsedInOperatingActivities",
  "NetCashFlowsFromUsedInOperatingActivities",
  "CashFlowsFromUsedInOperatingActivities",
  "CashFlowsFromUsedInOperatingActivitiesIFRS",
];
const CASH_NAMES = ["CashAndDueFromBanksBNK", "CashAndDueFromBanks", "CashAndCashEquivalents", "CashAndDeposits"];
const ASSET_NAMES = ["Assets", "AssetsIFRS", "TotalAssets"];
const NET_ASSET_NAMES = ["NetAssets", "Equity", "EquityIFRS", "StockholdersEquity", "EquityAttributableToOwnersOfParent"];

function localName(name: string) {
  return name.includes(":") ? name.slice(name.indexOf(":") + 1) : name;
}

function attrs(text: string) {
  const result: Record<string, string> = {};
  for (const match of text.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*["']([^"']*)["']/g)) {
    result[match[1].toLowerCase()] = match[2];
  }
  return result;
}

function tagText(body: string, tag: string) {
  const match = body.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"));
  return match?.[1]?.trim();
}

function contexts(text: string) {
  const map = new Map<string, Context>();
  for (const match of text.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi)) {
    const a = attrs(match[1]);
    const id = a.id;
    if (!id) continue;
    const body = match[2];
    const normalized = `${id} ${body}`.toLowerCase();
    map.set(id, {
      id,
      startDate: tagText(body, "xbrli:startDate"),
      endDate: tagText(body, "xbrli:endDate"),
      instant: tagText(body, "xbrli:instant"),
      consolidated: normalized.includes("consolidated"),
      current: normalized.includes("currentyear") || normalized.includes("currentperiod") || normalized.includes("currentfiscalyear"),
      prior: normalized.includes("prioryear") || normalized.includes("previousyear") || normalized.includes("priorperiod"),
    });
  }
  return map;
}

function facts(text: string) {
  const result: Fact[] = [];
  for (const match of text.matchAll(/<([A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*)\b([^>]*)>([^<]*)<\/\1>/g)) {
    const a = attrs(match[2]);
    const contextRef = a.contextref;
    if (!contextRef || a.nil === "true") continue;
    let value = Number(match[3].replace(/,/g, "").trim());
    if (!Number.isFinite(value)) continue;
    const scale = Number(a.scale ?? "0");
    if (Number.isFinite(scale) && scale !== 0) value *= 10 ** scale;
    if (a.sign === "-") value *= -1;
    result.push({ name: match[1], contextRef, value });
  }
  for (const match of text.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)) {
    const a = attrs(match[1]);
    if (!a.name || !a.contextref || a.nil === "true") continue;
    let value = Number(match[2].replace(/<[^>]+>/g, "").replace(/,/g, "").trim());
    if (!Number.isFinite(value)) continue;
    const scale = Number(a.scale ?? "0");
    if (Number.isFinite(scale) && scale !== 0) value *= 10 ** scale;
    if (a.sign === "-") value *= -1;
    result.push({ name: a.name, contextRef: a.contextref, value });
  }
  return result;
}

function contextScore(context: Context | undefined, duration: boolean) {
  if (!context) return -9999;
  if (duration && !(context.startDate && context.endDate)) return -9999;
  if (!duration && !context.instant) return -9999;
  let score = 0;
  if (context.current) score += 100;
  if (context.consolidated) score += 30;
  if (context.prior) score -= 100;
  return score;
}

function pick(allFacts: Fact[], allContexts: Map<string, Context>, names: string[], duration: boolean) {
  const priorities = new Map(names.map((name, index) => [name.toLowerCase(), names.length - index]));
  const candidates = allFacts
    .map((fact) => ({ fact, priority: priorities.get(localName(fact.name).toLowerCase()) ?? 0, context: allContexts.get(fact.contextRef) }))
    .filter((row) => row.priority > 0 && contextScore(row.context, duration) > -9999)
    .sort((a, b) => (b.priority - a.priority) || (contextScore(b.context, duration) - contextScore(a.context, duration)));
  return candidates[0]?.fact.value;
}

function validZip(docId: string) {
  const file = path.join(process.cwd(), "downloads", `${docId}.zip`);
  return fs.existsSync(file) && fs.statSync(file).size > 4;
}

function ensureZip(docId: string) {
  if (!validZip(docId)) execSync(`DOC_ID=${docId} npx tsx scripts/download-edinet.ts`, { stdio: "inherit" });
}

function parseFinanceDoc(docId: string) {
  ensureZip(docId);
  const zip = new AdmZip(path.join(process.cwd(), "downloads", `${docId}.zip`));
  const entries = zip.getEntries().filter((entry) => entry.entryName.startsWith("XBRL/PublicDoc/") && /\.(xbrl|htm)$/i.test(entry.entryName));
  const allFacts: Fact[] = [];
  const allContexts = new Map<string, Context>();
  for (const entry of entries) {
    const text = entry.getData().toString("utf8");
    for (const [key, value] of contexts(text)) allContexts.set(key, value);
    allFacts.push(...facts(text));
  }
  return {
    revenue: pick(allFacts, allContexts, REVENUE_NAMES, true),
    operatingIncome: pick(allFacts, allContexts, PROFIT_NAMES, true),
    operatingCF: pick(allFacts, allContexts, OPERATING_CF_NAMES, true),
    cash: pick(allFacts, allContexts, CASH_NAMES, false),
    assets: pick(allFacts, allContexts, ASSET_NAMES, false),
    netAssets: pick(allFacts, allContexts, NET_ASSET_NAMES, false),
  };
}

function mergeFound(base: Json, found: Record<string, number | undefined>) {
  const next = { ...base };
  for (const [key, value] of Object.entries(found)) {
    if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
  }
  return next;
}

async function main() {
  const [markets, analyses] = await Promise.all([
    loadAllSupabaseRows<MarketRow>("金融会社取得失敗", (from, to) =>
      supabaseAdmin.from("all_market_companies").select("ticker, company_name, industry_name").in("industry_name", FINANCE_INDUSTRIES).order("ticker").range(from, to)
    ),
    loadAllSupabaseRows<AnalysisRow>("分析取得失敗", (from, to) =>
      supabaseAdmin.from("company_analyses").select("ticker, financials, history").order("ticker").range(from, to)
    ),
  ]);

  const analysisMap = new Map(analyses.map((row) => [row.ticker, row]));
  const results: Json[] = [];
  let updated = 0;
  let failed = 0;

  for (let index = 0; index < markets.length; index += 1) {
    const market = markets[index];
    const analysis = analysisMap.get(market.ticker);
    const history = Array.isArray(analysis?.history) ? analysis!.history : [];
    try {
      const repaired = history.map((row) => {
        const docId = typeof row.docID === "string" ? row.docID : typeof row.docId === "string" ? row.docId : null;
        return docId ? mergeFound(row, parseFinanceDoc(docId)) : row;
      });
      const latest = repaired.at(-1) ?? analysis?.financials ?? {};
      const beforeLatest = history.at(-1) ?? {};
      const changed = JSON.stringify(repaired) !== JSON.stringify(history) || JSON.stringify(latest) !== JSON.stringify(analysis?.financials ?? {});

      if (APPLY && changed) {
        const { error } = await supabaseAdmin.from("company_analyses").update({ history: repaired, financials: latest }).eq("ticker", market.ticker);
        if (error) throw error;
        updated += 1;
      }

      results.push({ ticker: market.ticker, companyName: market.company_name, industry: market.industry_name, changed, before: { revenue: beforeLatest.revenue, operatingIncome: beforeLatest.operatingIncome }, after: { revenue: latest.revenue, operatingIncome: latest.operatingIncome } });
      if ((index + 1) % 20 === 0) console.log(`[進捗] ${index + 1}/${markets.length}`);
    } catch (error) {
      failed += 1;
      results.push({ ticker: market.ticker, companyName: market.company_name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const changedRows = results.filter((row) => row.changed === true);
  console.log("===== 金融系EDINET数値修復 =====");
  console.dir({ apply: APPLY, targets: markets.length, changed: changedRows.length, updated, failed, yamanashi: results.find((row) => row.ticker === "8360"), failureRows: results.filter((row) => row.error) }, { depth: null });
}

main().catch((error) => { console.error(error); process.exit(1); });
