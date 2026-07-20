import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";
import { calculateMarketScores } from "../lib/market-scoring-engine";

type J = Record<string, unknown>;
type Company = { id: string; ticker: string; company_name: string; market_segment: "prime"|"standard"|"growth"|"other" };
type Analysis = { ticker: string; financials: J|null; history: J[]|null };
type Period = { company_id: string; fiscal_year: number|null; period_end: string|null; document_id: string|null; financials: J|null; source_payload: J|null };
type H = { year: string; fiscalYear: number; fiscalMonth: number; fiscalPeriod: string; periodEnd: string; revenue: number|null; grossProfit: number|null; operatingIncome: number|null; netIncome: number|null; operatingCF: number|null; cash?: number|null; assets?: number|null; netAssets?: number|null; currentAssets?: number|null; currentLiabilities?: number|null; liabilities?: number|null; docID: string|null; profile?: string; metricLabels?: Record<string,string> };

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

function normalize(src: J, p?: Period): H|null {
  const periodEnd = date(src.periodEnd) ?? date(src.period_end) ?? date(p?.period_end);
  const fiscalYear = n(src.fiscalYear ?? src.fiscal_year ?? src.year ?? p?.fiscal_year) ?? (periodEnd ? Number(periodEnd.slice(0,4)) : null);
  const fiscalMonth = n(src.fiscalMonth ?? src.fiscal_month) ?? (periodEnd ? Number(periodEnd.slice(5,7)) : null);
  if (!periodEnd || !fiscalYear || !fiscalMonth || fiscalMonth < 1 || fiscalMonth > 12) return null;
  return {
    year: String(fiscalYear), fiscalYear, fiscalMonth,
    fiscalPeriod: String(src.fiscalPeriod ?? src.fiscal_period ?? `${fiscalYear}年${fiscalMonth}月期`), periodEnd,
    revenue: num(src.revenue), grossProfit: num(src.grossProfit), operatingIncome: num(src.operatingIncome),
    netIncome: num(src.netIncome), operatingCF: num(src.operatingCF), cash: num(src.cash), assets: num(src.assets),
    netAssets: num(src.netAssets), currentAssets: num(src.currentAssets), currentLiabilities: num(src.currentLiabilities),
    liabilities: num(src.liabilities),
    docID: typeof src.docID === "string" ? src.docID : typeof src.documentId === "string" ? src.documentId : typeof src.document_id === "string" ? src.document_id : p?.document_id ?? null,
    profile: typeof src.profile === "string" ? src.profile : undefined,
    metricLabels: src.metricLabels && typeof src.metricLabels === "object" ? src.metricLabels as Record<string,string> : undefined,
  };
}

function quality(r: H) {
  return [r.revenue,r.grossProfit,r.operatingIncome,r.netIncome,r.operatingCF,r.cash,r.assets,r.netAssets]
    .filter(v => typeof v === "number" && Number.isFinite(v)).length;
}

function merge(rows: H[]) {
  const map = new Map<string,H>();
  for (const row of rows) {
    const old = map.get(row.periodEnd);
    if (!old || quality(row) > quality(old)) map.set(row.periodEnd,row);
  }
  return [...map.values()].sort((a,b)=>a.periodEnd.localeCompare(b.periodEnd)).slice(-3);
}

async function main() {
  const [companies, analyses, periods] = await Promise.all([
    loadAllSupabaseRows<Company>("companies",(f,t)=>supabaseAdmin.from("all_market_companies").select("id,ticker,company_name,market_segment").eq("listing_status","listed").order("ticker").range(f,t)),
    loadAllSupabaseRows<Analysis>("analyses",(f,t)=>supabaseAdmin.from("company_analyses").select("ticker,financials,history").order("ticker").range(f,t)),
    loadAllSupabaseRows<Period>("periods",(f,t)=>supabaseAdmin.from("company_financial_periods").select("company_id,fiscal_year,period_end,document_id,financials,source_payload").eq("period_type","annual").order("period_end").range(f,t)),
  ]);
  const analysisMap = new Map(analyses.map(x=>[x.ticker,x]));
  const periodMap = new Map<string,Period[]>();
  for (const p of periods) periodMap.set(p.company_id,[...(periodMap.get(p.company_id)??[]),p]);
  const beforeOnePeriod = analyses.filter(x=>(x.history?.length??0)<2).length;
  let repaired = 0;
  const unresolved: {ticker:string;name:string;periods:number}[] = [];
  const failures: {ticker:string;error:string}[] = [];

  for (const c of companies) {
    const a = analysisMap.get(c.ticker);
    if (!a) continue;
    try {
      const old = (a.history??[]).map(x=>normalize(x)).filter((x):x is H=>Boolean(x));
      const norm = (periodMap.get(c.id)??[]).map(p=>normalize({...p.source_payload,...p.financials},p)).filter((x):x is H=>Boolean(x));
      const current = a.financials ? normalize(a.financials) : null;
      const history = merge([...old,...norm,...(current?[current]:[])]);
      if (history.length < 2) { unresolved.push({ticker:c.ticker,name:c.company_name,periods:norm.length}); continue; }
      const scores = calculateMarketScores(c.market_segment,(a.financials??{}) as Parameters<typeof calculateMarketScores>[1],history as Parameters<typeof calculateMarketScores>[2]);
      const { error } = await supabaseAdmin.from("company_analyses").update({history,score:scores.totalScore,score_breakdown:{growth:scores.growthScore,quality:scores.qualityScore,safety:scores.safetyScore,completenessPenalty:scores.completenessPenalty},updated_at:new Date().toISOString()}).eq("ticker",c.ticker);
      if (error) throw new Error(error.message);
      repaired++;
      console.log(`[OK] ${c.ticker} ${c.company_name}: ${a.history?.length??0}期 -> ${history.length}期`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      failures.push({ticker:c.ticker,error});
      console.error(`[FAIL] ${c.ticker}: ${error}`);
    }
  }

  const verify = await loadAllSupabaseRows<Analysis>("verify",(f,t)=>supabaseAdmin.from("company_analyses").select("ticker,financials,history").order("ticker").range(f,t));
  const afterOnePeriod = verify.filter(x=>(x.history?.length??0)<2).length;
  const kioxiaHistoryCount = verify.find(x=>x.ticker==="285A")?.history?.length ?? 0;
  const reportPath = path.join(process.cwd(),"logs",`all-company-history-restore-${new Date().toISOString().replace(/[:.]/g,"-")}.json`);
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  fs.writeFileSync(reportPath,JSON.stringify({beforeOnePeriod,repaired,afterOnePeriod,kioxiaHistoryCount,unresolved,failures},null,2));
  console.log("===== 全社複数期履歴復元結果 =====");
  console.log({beforeOnePeriod,repaired,afterOnePeriod,failures:failures.length,kioxiaHistoryCount,reportPath});
  if (failures.length) process.exitCode=1;
}

main().catch(e=>{console.error(e);process.exit(1);});
