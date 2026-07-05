import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { scoreCompany } from "@/lib/score";
import { generateSignals } from "@/lib/signals";
import {
  extractFinancials,
  extractRowsFromEdinetCsvZip,
} from "@/lib/edinet-financial-parser";
import { calculateFinancialMetrics } from "@/lib/financial-metrics";
import {
  hasAuditorChanged,
  parseDisclosureSignalsFromBuffer,
} from "@/lib/disclosure-parser";

type GrowthCompany = {
  ticker: string;
  name: string;
};

type EdinetDocument = {
  docID: string;
  secCode?: string;
  filerName?: string;
  docDescription?: string;
};

const masterPath = path.join(process.cwd(), "data", "growth-companies.json");
const EDINET_BASE = "https://api.edinet-fsa.go.jp/api/v2";

function todayJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function riskLevelFromDangerScore(score: number) {
  if (score >= 85) return "REJECT";
  if (score >= 70) return "DANGEROUS";
  if (score >= 45) return "WARNING";
  if (score >= 25) return "WATCH";
  return "SAFE";
}

function dangerScoreFromSignals(signals: { level: string }[]) {
  const score = signals.reduce((sum, signal) => {
    if (signal.level === "danger") return sum + 35;
    if (signal.level === "warning") return sum + 15;
    return sum;
  }, 0);

  return Math.min(100, score);
}

function shouldProcessDoc(doc: EdinetDocument) {
  const desc = doc.docDescription ?? "";

  return (
    desc.includes("有価証券報告書") ||
    desc.includes("四半期報告書") ||
    desc.includes("半期報告書")
  );
}

async function fetchEdinetDocuments(date: string) {
  const apiKey = process.env.EDINET_API_KEY;

  if (!apiKey) {
    throw new Error("EDINET_API_KEY が設定されていません");
  }

  const url = `${EDINET_BASE}/documents.json?date=${date}&type=2&Subscription-Key=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`EDINET documents fetch failed: ${res.status}`);
  }

  const json = await res.json();
  return (json.results ?? []) as EdinetDocument[];
}

async function fetchCsvZip(docID: string) {
  const apiKey = process.env.EDINET_API_KEY;
  const url = `${EDINET_BASE}/documents/${docID}?type=5&Subscription-Key=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`EDINET CSV fetch failed: ${docID} ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function fetchXbrlZip(docID: string) {
  const apiKey = process.env.EDINET_API_KEY;
  const url = `${EDINET_BASE}/documents/${docID}?type=1&Subscription-Key=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`EDINET XBRL fetch failed: ${docID} ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function fetchNewsCron(origin: string) {
  try {
    await fetch(`${origin}/api/cron/fetch-news`, {
      headers: process.env.CRON_SECRET
        ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
        : {},
      cache: "no-store",
    });
  } catch {
    // ニュース更新失敗で財務DB更新は止めない
  }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!fs.existsSync(masterPath)) {
    return NextResponse.json(
      { error: "data/growth-companies.json が見つかりません" },
      { status: 500 }
    );
  }

  const origin = new URL(req.url).origin;
  await fetchNewsCron(origin);

  const growthCompanies = JSON.parse(
    fs.readFileSync(masterPath, "utf8")
  ) as GrowthCompany[];

  const growthByTicker = new Map(
    growthCompanies.map((company) => [company.ticker, company])
  );

  const date = todayJST();
  const docs = await fetchEdinetDocuments(date);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      if (!shouldProcessDoc(doc)) {
        skipped += 1;
        continue;
      }

      const ticker = doc.secCode?.slice(0, 4);

      if (!ticker || !growthByTicker.has(ticker)) {
        skipped += 1;
        continue;
      }

      const company = growthByTicker.get(ticker)!;
      const zipBuffer = await fetchCsvZip(doc.docID);
      const xbrlBuffer = await fetchXbrlZip(doc.docID);
      const rows = extractRowsFromEdinetCsvZip(zipBuffer);
      const extracted = extractFinancials(rows);
      const f = extracted.current;
      const disclosure = parseDisclosureSignalsFromBuffer(xbrlBuffer);
      const auditorChanged = hasAuditorChanged(disclosure);
      const financials = calculateFinancialMetrics(f, extracted.prior, {
        goingConcern: disclosure.goingConcern,
        msWarrant: disclosure.msWarrant,
        auditorChanged,
      });

      if (
        f.revenue === null &&
        f.assets === null &&
        f.operatingIncome === null &&
        f.cash === null &&
        f.netAssets === null
      ) {
        failed += 1;
        continue;
      }

      const monthlyCashBurn =
        f.operatingCF !== null && f.operatingCF < 0
          ? Math.abs(f.operatingCF) / 12
          : f.operatingCF === null
            ? undefined
            : 0;

      const score = scoreCompany({
        revenueGrowth: financials.revenueGrowth,
        grossProfitGrowth: financials.grossProfitGrowth,
        operatingMargin: financials.operatingMargin,
        ebitdaMargin: financials.operatingMargin,
        ocfMargin: financials.operatingCFMargin,
        ruleOf40:
          financials.revenueGrowth !== undefined &&
          financials.operatingMargin !== undefined
            ? financials.revenueGrowth + financials.operatingMargin
            : undefined,
        operatingCashFlows: f.operatingCF === null ? [] : [f.operatingCF],
        operatingIncomes: f.operatingIncome === null ? [] : [f.operatingIncome],
        cash: f.cash ?? undefined,
        monthlyCashBurn,
        currentLiabilities: f.currentLiabilities ?? undefined,
        equityRatio: financials.equityRatio,
        hasMsWarrant: disclosure.msWarrant,
        equityFinancingCountLast3Years: 0,
        warrantTrend: "none",
        cbTrend: "none",
      });

      const signals = generateSignals({
        operatingCashFlows: f.operatingCF === null ? [] : [f.operatingCF],
        operatingIncomes: f.operatingIncome === null ? [] : [f.operatingIncome],
        cash: f.cash ?? undefined,
        monthlyCashBurn,
        hasMsWarrant: disclosure.msWarrant,
        equityFinancingCountLast3Years: 0,
        auditorChanged,
        goingConcernNote: disclosure.goingConcern,
        currentRatioTrend: "stable",
      });

      const dangerScore = dangerScoreFromSignals(signals);
      const riskLevel = riskLevelFromDangerScore(dangerScore);

      await supabaseAdmin.from("company_analyses").upsert(
        {
          ticker,
          company_name: company.name || doc.filerName || ticker,
          doc_id: doc.docID,
          score: score.totalScore,
          danger_score: dangerScore,
          risk_level: riskLevel,
          financials,
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
              ...(f.revenue === null ? {} : { revenue: f.revenue }),
              ...(f.operatingIncome === null ? {} : { operatingIncome: f.operatingIncome }),
              ...(f.operatingCF === null ? {} : { operatingCF: f.operatingCF }),
              ...(f.netIncome === null ? {} : { netIncome: f.netIncome }),
            },
          ],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ticker" }
      );

      processed += 1;
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  await supabaseAdmin.from("user_notifications").insert({
    clerk_user_id: "system",
    title: "EDINET自動更新完了",
    body: `date=${date}, processed=${processed}, updated=${updated}, skipped=${skipped}, failed=${failed}`,
  });

  return NextResponse.json({
    ok: true,
    type: "edinet-update",
    date,
    totalDocs: docs.length,
    processed,
    updated,
    skipped,
    failed,
  });
}
