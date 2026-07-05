import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { scoreCompany } from "../lib/score";
import { generateSignals } from "../lib/signals";
import {
  extractFinancials,
  extractRowsFromEdinetCsvZip,
} from "../lib/edinet-financial-parser";
import { calculateFinancialMetrics, type FinancialFacts } from "../lib/financial-metrics";

type EdinetDocument = {
  docID: string;
  secCode?: string;
  filerName?: string;
  docDescription?: string;
};

const EDINET_BASE = "https://api.edinet-fsa.go.jp/api/v2";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const edinetKey = process.env.EDINET_API_KEY;

if (!supabaseUrl || !supabaseKey || !edinetKey) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / EDINET_API_KEY を確認してください");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const documentCache = new Map<string, EdinetDocument[]>();
const zipCache = new Map<string, Buffer>();

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

  return (
    desc.includes("有価証券報告書") ||
    desc.includes("半期報告書") ||
    desc.includes("四半期報告書")
  );
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

function historyRowFromFacts(year: number, facts: Partial<FinancialFacts>) {
  return {
    year,
    ...(facts.revenue === null || facts.revenue === undefined ? {} : { revenue: facts.revenue }),
    ...(facts.grossProfit === null || facts.grossProfit === undefined ? {} : { grossProfit: facts.grossProfit }),
    ...(facts.netIncome === null || facts.netIncome === undefined ? {} : { netIncome: facts.netIncome }),
    ...(facts.operatingIncome === null || facts.operatingIncome === undefined ? {} : { operatingIncome: facts.operatingIncome }),
    ...(facts.operatingCF === null || facts.operatingCF === undefined ? {} : { operatingCF: facts.operatingCF }),
  };
}

function buildHistory(currentYear: number, current: FinancialFacts, prior: FinancialFacts) {
  const rows = [];

  if (hasAnyFinancialValue(prior)) {
    rows.push(historyRowFromFacts(currentYear - 1, prior));
  }

  rows.push(historyRowFromFacts(currentYear, current));
  return rows;
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

  for (let i = 0; i < 730; i++) {
    const date = daysAgo(i);
    const docs = await fetchDocuments(date);

    for (const doc of docs) {
      const secCode = doc.secCode?.slice(0, 4);
      if (secCode === ticker && shouldProcessDoc(doc)) {
        found.push({ date, doc });
      }
    }

    if (found.length >= 5) break;
  }

  return found;
}

async function fetchCsvZip(docID: string) {
  if (zipCache.has(docID)) return zipCache.get(docID)!;

  const url = `${EDINET_BASE}/documents/${docID}?type=5&Subscription-Key=${edinetKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`EDINET CSV fetch failed: ${docID} ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  zipCache.set(docID, buffer);
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
      history.length < 2 ||
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
        console.log("  EDINET書類なし");
        skipped += 1;
        continue;
      }

      let usedDocId = row.doc_id;
      let selected: {
        current: FinancialFacts;
        prior: FinancialFacts;
        financials: ReturnType<typeof calculateFinancialMetrics>;
      } | null = null;

      for (const item of docs) {
        const zipBuffer = await fetchCsvZip(item.doc.docID);
        const rows = extractRowsFromEdinetCsvZip(zipBuffer);
        const extracted = extractFinancials(rows);
        const nf = extracted.current;
        const calculated = calculateFinancialMetrics(nf, extracted.prior);

        if (
          nf.revenue === null &&
          nf.operatingIncome === null &&
          nf.operatingCF === null &&
          nf.cash === null &&
          nf.assets === null &&
          nf.netAssets === null
        ) {
          continue;
        }

        selected = {
          current: nf,
          prior: extracted.prior,
          financials: calculated,
        };
        usedDocId = item.doc.docID;
        break;
      }

      if (!selected) {
        console.log("  財務数値を取得できず");
        skipped += 1;
        continue;
      }

      const f = selected.current;
      const calculated = selected.financials;
      const financials = {
        ...(row.financials ?? {}),
        ...calculated,
      };

      const monthlyCashBurn =
        f.operatingCF !== null && f.operatingCF < 0 ? Math.abs(f.operatingCF) / 12 : 0;

      const score = scoreCompany({
        revenueGrowth: calculated.revenueGrowth,
        grossProfitGrowth: calculated.grossProfitGrowth,
        operatingMargin: calculated.operatingMargin,
        ebitdaMargin: calculated.operatingMargin,
        ocfMargin: calculated.operatingCFMargin,
        ruleOf40:
          calculated.revenueGrowth !== undefined && calculated.operatingMargin !== undefined
            ? calculated.revenueGrowth + calculated.operatingMargin
            : undefined,
        operatingCashFlows: f.operatingCF === null ? [] : [f.operatingCF],
        operatingIncomes: f.operatingIncome === null ? [] : [f.operatingIncome],
        cash: f.cash ?? undefined,
        monthlyCashBurn,
        currentLiabilities: f.currentLiabilities ?? undefined,
        equityRatio: calculated.equityRatio,
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
          history: buildHistory(new Date().getFullYear(), selected.current, selected.prior),
          updated_at: new Date().toISOString(),
        })
        .eq("ticker", ticker);

      console.log("  updated", {
        doc_id: usedDocId,
        history: buildHistory(new Date().getFullYear(), selected.current, selected.prior),
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
