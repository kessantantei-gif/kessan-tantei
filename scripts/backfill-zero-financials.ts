import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { scoreCompany } from "../lib/score";
import { generateSignals } from "../lib/signals";
import {
  extractFinancials,
  extractRowsFromEdinetCsvZip,
} from "../lib/edinet-financial-parser";
import { calculateFinancialMetrics } from "../lib/financial-metrics";

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
    return (
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
      const old = row.financials ?? {};

      const financials = {
        revenue: Number(old.revenue ?? 0),
        grossProfit: Number(old.grossProfit ?? 0),
        operatingIncome: Number(old.operatingIncome ?? 0),
        operatingCF: Number(old.operatingCF ?? 0),
        cash: Number(old.cash ?? 0),
        currentLiabilities: Number(old.currentLiabilities ?? 0),
        assets: Number(old.assets ?? 0),
        netAssets: Number(old.netAssets ?? 0),
        revenueGrowth: Number(old.revenueGrowth ?? 0),
        grossProfitGrowth: Number(old.grossProfitGrowth ?? 0),
        equityRatio: Number(old.equityRatio ?? 0),
        operatingMargin: Number(old.operatingMargin ?? 0),
        ocfMargin: Number(old.ocfMargin ?? 0),
      };

      console.log(`\n${ticker} ${row.company_name}`);

      const docs = await findDocs(ticker);

      if (docs.length === 0) {
        console.log("  EDINET書類なし");
        skipped += 1;
        continue;
      }

      let usedDocId = row.doc_id;

      for (const item of docs) {
        const zipBuffer = await fetchCsvZip(item.doc.docID);
        const rows = extractRowsFromEdinetCsvZip(zipBuffer);
        const extracted = extractFinancials(rows);
        const nf = extracted.current;
        const calculated = calculateFinancialMetrics(nf, extracted.prior);

        if (financials.revenue === 0 && nf.revenue !== null) {
          financials.revenue = nf.revenue;
          if (calculated.revenueGrowth !== undefined) {
            financials.revenueGrowth = calculated.revenueGrowth;
          }
          usedDocId = item.doc.docID;
        }

        if (financials.grossProfit === 0 && nf.grossProfit !== null) {
          financials.grossProfit = nf.grossProfit;
          if (calculated.grossProfitGrowth !== undefined) {
            financials.grossProfitGrowth = calculated.grossProfitGrowth;
          }
          usedDocId = item.doc.docID;
        }

        if (financials.operatingIncome === 0 && nf.operatingIncome !== null) {
          financials.operatingIncome = nf.operatingIncome;
          usedDocId = item.doc.docID;
        }

        if (financials.operatingCF === 0 && nf.operatingCF !== null) {
          financials.operatingCF = nf.operatingCF;
          usedDocId = item.doc.docID;
        }

        if (financials.cash === 0 && nf.cash !== null) {
          financials.cash = nf.cash;
          usedDocId = item.doc.docID;
        }

        if (financials.currentLiabilities === 0 && nf.currentLiabilities !== null) {
          financials.currentLiabilities = nf.currentLiabilities;
          usedDocId = item.doc.docID;
        }

        if (financials.assets === 0 && nf.assets !== null) {
          financials.assets = nf.assets;
          usedDocId = item.doc.docID;
        }

        if (financials.netAssets === 0 && nf.netAssets !== null) {
          financials.netAssets = nf.netAssets;
          usedDocId = item.doc.docID;
        }

        const allFilled =
          financials.revenue !== 0 &&
          financials.operatingIncome !== 0 &&
          financials.operatingCF !== 0 &&
          financials.cash !== 0 &&
          financials.assets !== 0 &&
          financials.netAssets !== 0;

        if (allFilled) break;
      }

      financials.equityRatio =
        financials.assets > 0
          ? Number(((financials.netAssets / financials.assets) * 100).toFixed(2))
          : 0;

      financials.operatingMargin =
        financials.revenue > 0
          ? Number(((financials.operatingIncome / financials.revenue) * 100).toFixed(2))
          : 0;

      financials.ocfMargin =
        financials.revenue > 0
          ? Number(((financials.operatingCF / financials.revenue) * 100).toFixed(2))
          : 0;

      const monthlyCashBurn =
        financials.operatingCF < 0 ? Math.abs(financials.operatingCF) / 12 : 0;

      const score = scoreCompany({
        revenueGrowth: financials.revenueGrowth,
        grossProfitGrowth: financials.grossProfitGrowth,
        operatingMargin: financials.operatingMargin,
        ebitdaMargin: financials.operatingMargin,
        ocfMargin: financials.ocfMargin,
        ruleOf40: financials.revenueGrowth + financials.operatingMargin,
        operatingCashFlows: [financials.operatingCF],
        operatingIncomes: [financials.operatingIncome],
        cash: financials.cash,
        monthlyCashBurn,
        currentLiabilities: financials.currentLiabilities,
        equityRatio: financials.equityRatio,
        hasMsWarrant: false,
        equityFinancingCountLast3Years: 0,
        warrantTrend: "none",
        cbTrend: "none",
      });

      const signals = generateSignals({
        operatingCashFlows: [financials.operatingCF],
        operatingIncomes: [financials.operatingIncome],
        cash: financials.cash,
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
          history: [
            {
              year: new Date().getFullYear(),
              revenue: financials.revenue,
              operatingIncome: financials.operatingIncome,
              operatingCF: financials.operatingCF,
            },
          ],
          updated_at: new Date().toISOString(),
        })
        .eq("ticker", ticker);

      console.log("  updated", financials);
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
