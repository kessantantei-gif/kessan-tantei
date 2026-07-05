import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { scoreCompany } from "../lib/score";
import { generateSignals } from "../lib/signals";
import {
  extractFinancials,
  extractFiscalPeriodsFromEdinetXbrlZip,
  extractRowsFromEdinetCsvZip,
  type FiscalPeriodInfo,
} from "../lib/edinet-financial-parser";
import { calculateFinancialMetrics, type FinancialFacts } from "../lib/financial-metrics";

type EdinetDocument = {
  docID: string;
  secCode?: string;
  filerName?: string;
  docDescription?: string;
};

type HistoryRow = {
  year: number;
  fiscalYear?: number;
  fiscalMonth?: number;
  fiscalPeriod?: string;
  periodEnd?: string;
  revenue?: number;
  grossProfit?: number;
  netIncome?: number;
  operatingIncome?: number;
  operatingCF?: number;
};

const EDINET_BASE = "https://api.edinet-fsa.go.jp/api/v2";
const SEARCH_DAYS = 365 * 5;
const MAX_DOCS_PER_COMPANY = 8;

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const edinetKey = process.env.EDINET_API_KEY;

if (!supabaseUrl || !supabaseKey || !edinetKey) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / EDINET_API_KEY を確認してください");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const documentCache = new Map<string, EdinetDocument[]>();
const csvZipCache = new Map<string, Buffer>();
const xbrlZipCache = new Map<string, Buffer>();

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

function shouldProcessDoc(doc: EdinetDocument) {
  const desc = doc.docDescription ?? "";

  if (desc.includes("訂正")) return false;

  // 年次推移は有価証券報告書だけで作る。
  // 半期・四半期を混ぜると年度重複や期ズレの原因になる。
  return desc.includes("有価証券報告書");
}

function hasAnyFinancialValue(facts: Partial<FinancialFacts>) {
  return [
    facts.revenue,
    facts.grossProfit,
    facts.netIncome,
    facts.operatingIncome,
    facts.operatingCF,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

function fallbackFiscalInfo(year: number): FiscalPeriodInfo {
  return {
    fiscalYear: year,
    fiscalPeriod: `${year}年度`,
  };
}

function historyRowFromFacts(
  fallbackYear: number,
  facts: Partial<FinancialFacts>,
  fiscalInfo?: FiscalPeriodInfo | null
) {
  const fiscal = fiscalInfo ?? fallbackFiscalInfo(fallbackYear);
  const fiscalYear = fiscal.fiscalYear ?? fallbackYear;

  return {
    year: fiscalYear,
    ...(fiscal.fiscalYear === undefined ? {} : { fiscalYear: fiscal.fiscalYear }),
    ...(fiscal.fiscalMonth === undefined ? {} : { fiscalMonth: fiscal.fiscalMonth }),
    ...(fiscal.fiscalPeriod === undefined ? {} : { fiscalPeriod: fiscal.fiscalPeriod }),
    ...(fiscal.periodEnd === undefined ? {} : { periodEnd: fiscal.periodEnd }),
    ...(facts.revenue === null || facts.revenue === undefined ? {} : { revenue: facts.revenue }),
    ...(facts.grossProfit === null || facts.grossProfit === undefined ? {} : { grossProfit: facts.grossProfit }),
    ...(facts.netIncome === null || facts.netIncome === undefined ? {} : { netIncome: facts.netIncome }),
    ...(facts.operatingIncome === null || facts.operatingIncome === undefined ? {} : { operatingIncome: facts.operatingIncome }),
    ...(facts.operatingCF === null || facts.operatingCF === undefined ? {} : { operatingCF: facts.operatingCF }),
  };
}

function mergeHistoryRows(base: HistoryRow | undefined, incoming: HistoryRow) {
  return {
    ...(base ?? {}),
    ...incoming,
    year: incoming.year,
  };
}

function latestCompleteHistory(history: HistoryRow[]) {
  return [...history]
    .sort((a, b) => b.year - a.year)
    .find(
      (row) =>
        typeof row.revenue === "number" ||
        typeof row.operatingIncome === "number" ||
        typeof row.operatingCF === "number"
    );
}

function priorHistoryRow(history: HistoryRow[], latestYear: number) {
  return [...history]
    .filter((row) => row.year < latestYear)
    .sort((a, b) => b.year - a.year)[0];
}

async function fetchDocuments(date: string) {
  if (documentCache.has(date)) return documentCache.get(date)!;

  const url = `${EDINET_BASE}/documents.json?date=${date}&type=2&Subscription-Key=${edinetKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`EDINET documents fetch failed: ${date} ${res.status}`);
  }

  const json = await res.json();
  const docs = (json.results ?? []) as EdinetDocument[];
  documentCache.set(date, docs);
  return docs;
}

async function findDocs(ticker: string) {
  const found: { date: string; doc: EdinetDocument }[] = [];
  const seenDocIds = new Set<string>();

  for (let i = 0; i < SEARCH_DAYS; i++) {
    const date = daysAgo(i);
    const docs = await fetchDocuments(date);

    for (const doc of docs) {
      const secCode = doc.secCode?.slice(0, 4);
      if (secCode === ticker && shouldProcessDoc(doc) && !seenDocIds.has(doc.docID)) {
        seenDocIds.add(doc.docID);
        found.push({ date, doc });
      }
    }

    if (found.length >= MAX_DOCS_PER_COMPANY) break;
  }

  return found;
}

async function fetchCsvZip(docID: string) {
  if (csvZipCache.has(docID)) return csvZipCache.get(docID)!;

  const url = `${EDINET_BASE}/documents/${docID}?type=5&Subscription-Key=${edinetKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`EDINET CSV fetch failed: ${docID} ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  csvZipCache.set(docID, buffer);
  return buffer;
}

async function fetchXbrlZip(docID: string) {
  if (xbrlZipCache.has(docID)) return xbrlZipCache.get(docID)!;

  const url = `${EDINET_BASE}/documents/${docID}?type=1&Subscription-Key=${edinetKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`EDINET XBRL fetch failed: ${docID} ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  xbrlZipCache.set(docID, buffer);
  return buffer;
}

function isZero(value: any) {
  return Number(value ?? 0) === 0;
}

function riskLevelFromDangerScore(score: number) {
  if (score >= 85) return "REJECT";
  if (score >= 70) return "DANGEROUS";
  if (score >= 45) return "WARNING";
  if (score >= 25) return "WATCH";
  return "SAFE";
}

function dangerScoreFromSignals(signals: { level: string }[]) {
  return Math.min(
    100,
    signals.reduce((sum, signal) => {
      if (signal.level === "danger") return sum + 35;
      if (signal.level === "warning") return sum + 15;
      return sum;
    }, 0)
  );
}

function factsFromHistory(row: HistoryRow | undefined): FinancialFacts {
  return {
    revenue: row?.revenue ?? null,
    grossProfit: row?.grossProfit ?? null,
    netIncome: row?.netIncome ?? null,
    operatingIncome: row?.operatingIncome ?? null,
    operatingCF: row?.operatingCF ?? null,
    cash: null,
    currentLiabilities: null,
    assets: null,
    netAssets: null,
  };
}

async function main() {
  const { data, error } = await supabase
    .from("company_analyses")
    .select("*")
    .limit(1000);

  if (error) throw error;

  const targets = (data ?? []).filter((row: any) => {
    const f = row.financials ?? {};
    const history = Array.isArray(row.history) ? row.history : [];

    return (
      history.length < 3 ||
      history.length > 3 ||
      history.some((item: any) => !item.fiscalPeriod || !item.fiscalMonth) ||
      isZero(f.revenue) ||
      isZero(f.operatingIncome) ||
      isZero(f.operatingCF) ||
      isZero(f.cash) ||
      isZero(f.assets) ||
      isZero(f.netAssets)
    );
  });

  console.log(`補正対象: ${targets.length}社`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    try {
      const ticker = row.ticker;

      console.log(`\n${ticker} ${row.company_name}`);

      const docs = await findDocs(ticker);

      if (docs.length === 0) {
        console.log("  EDINET有価証券報告書なし");
        skipped += 1;
        continue;
      }

      let usedDocId = row.doc_id;
      const historyByYear = new Map<number, HistoryRow>();
      let latestCurrent: FinancialFacts | null = null;
      let latestPrior: FinancialFacts | null = null;
      let latestFinancials: ReturnType<typeof calculateFinancialMetrics> | null = null;

      for (const item of docs) {
        const csvBuffer = await fetchCsvZip(item.doc.docID);
        const xbrlBuffer = await fetchXbrlZip(item.doc.docID);
        const rows = extractRowsFromEdinetCsvZip(csvBuffer);
        const extracted = extractFinancials(rows);
        const fiscalPeriods = extractFiscalPeriodsFromEdinetXbrlZip(xbrlBuffer);
        const current = extracted.current;
        const prior = extracted.prior;

        if (
          current.revenue === null &&
          current.operatingIncome === null &&
          current.operatingCF === null &&
          current.cash === null &&
          current.assets === null &&
          current.netAssets === null
        ) {
          continue;
        }

        const currentFallbackYear = new Date(item.date).getFullYear();
        const currentFiscalYear = fiscalPeriods.current?.fiscalYear ?? currentFallbackYear;
        const priorFiscalYear = fiscalPeriods.prior?.fiscalYear ?? currentFiscalYear - 1;

        if (hasAnyFinancialValue(prior)) {
          const priorRow = historyRowFromFacts(priorFiscalYear, prior, fiscalPeriods.prior);
          historyByYear.set(
            priorRow.year,
            mergeHistoryRows(historyByYear.get(priorRow.year), priorRow)
          );
        }

        if (hasAnyFinancialValue(current)) {
          const currentRow = historyRowFromFacts(currentFiscalYear, current, fiscalPeriods.current);
          historyByYear.set(
            currentRow.year,
            mergeHistoryRows(historyByYear.get(currentRow.year), currentRow)
          );
        }

        if (!latestCurrent) {
          latestCurrent = current;
          latestPrior = prior;
          latestFinancials = calculateFinancialMetrics(current, prior);
          usedDocId = item.doc.docID;
        }
      }

      const history = [...historyByYear.values()]
        .sort((a, b) => a.year - b.year)
        .slice(-3);

      if (!latestCurrent || !latestFinancials || history.length === 0) {
        console.log("  財務履歴を取得できず");
        skipped += 1;
        continue;
      }

      const latestRow = latestCompleteHistory(history);
      const priorRow = latestRow ? priorHistoryRow(history, latestRow.year) : undefined;
      const recalculated = latestRow
        ? calculateFinancialMetrics(factsFromHistory(latestRow), factsFromHistory(priorRow))
        : latestFinancials;
      const f = latestCurrent;
      const financials = {
        ...(row.financials ?? {}),
        ...latestFinancials,
        ...recalculated,
      };

      const monthlyCashBurn =
        f.operatingCF !== null && f.operatingCF < 0 ? Math.abs(f.operatingCF) / 12 : 0;

      const score = scoreCompany({
        revenueGrowth: recalculated.revenueGrowth,
        grossProfitGrowth: recalculated.grossProfitGrowth,
        operatingMargin: recalculated.operatingMargin ?? latestFinancials.operatingMargin,
        ebitdaMargin: recalculated.operatingMargin ?? latestFinancials.operatingMargin,
        ocfMargin: recalculated.operatingCFMargin ?? latestFinancials.operatingCFMargin,
        ruleOf40:
          recalculated.revenueGrowth !== undefined &&
          (recalculated.operatingMargin ?? latestFinancials.operatingMargin) !== undefined
            ? recalculated.revenueGrowth + (recalculated.operatingMargin ?? latestFinancials.operatingMargin ?? 0)
            : undefined,
        operatingCashFlows: f.operatingCF === null ? [] : [f.operatingCF],
        operatingIncomes: f.operatingIncome === null ? [] : [f.operatingIncome],
        cash: f.cash ?? undefined,
        monthlyCashBurn,
        currentLiabilities: f.currentLiabilities ?? undefined,
        equityRatio: latestFinancials.equityRatio,
        hasMsWarrant: false,
        equityFinancingCountLast3Years: 0,
        warrantTrend: "none",
        cbTrend: "none",
      });

      const signals = generateSignals({
        operatingCashFlows: f.operatingCF === null ? [] : [f.operatingCF],
        operatingIncomes: f.operatingIncome === null ? [] : [f.operatingIncome],
        cash: f.cash ?? undefined,
        monthlyCashBurn,
        hasMsWarrant: false,
        equityFinancingCountLast3Years: 0,
        auditorChanged: false,
        goingConcernNote: false,
        currentRatioTrend: "stable",
      });

      const dangerScore = dangerScoreFromSignals(signals);
      const riskLevel = riskLevelFromDangerScore(dangerScore);

      await supabase
        .from("company_analyses")
        .update({
          doc_id: usedDocId,
          financials,
          score: score.totalScore,
          danger_score: dangerScore,
          risk_level: riskLevel,
          score_breakdown: {
            growth: Math.round(score.growthScore * 0.4),
            quality: Math.round(score.safetyScore * 0.3),
            safety: Math.round(score.dilutionScore * 0.3),
          },
          risk: {
            flags: signals.map((signal) => ({
              title: signal.title,
              description: signal.description,
              level: signal.level,
              scoreImpact:
                signal.level === "danger"
                  ? 35
                  : signal.level === "warning"
                  ? 15
                  : 0,
            })),
            riskLevel,
            dangerScore,
          },
          history,
          updated_at: new Date().toISOString(),
        })
        .eq("ticker", ticker);

      console.log("  updated", {
        doc_id: usedDocId,
        historyPeriods: history.map((item) => item.fiscalPeriod ?? `${item.year}年度`),
      });
      updated += 1;
    } catch (error) {
      console.log("  failed", error);
      failed += 1;
    }
  }

  console.log("\n完了");
  console.log({ updated, skipped, failed });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
