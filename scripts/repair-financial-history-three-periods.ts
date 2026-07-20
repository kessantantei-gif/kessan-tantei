import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";
import { calculateMarketScores } from "../lib/market-scoring-engine";

type Json = Record<string, unknown>;
type Company = {
  id: string;
  ticker: string;
  company_name: string;
  industry_name: string | null;
  market_segment: "prime" | "standard" | "growth" | "other";
  is_financial: boolean;
};
type Analysis = {
  ticker: string;
  financials: Json | null;
  history: Json[] | null;
};
type Period = {
  company_id: string;
  fiscal_year: number;
  period_end: string;
  document_id: string;
  financials: Json | null;
};
type Profile = "bank" | "insurance";
type Extracted = Json & {
  profile: Profile;
  revenue: number;
  operatingIncome: number;
  cash: number;
  assets: number;
  liabilities: number;
  netAssets: number;
  loans?: number;
  deposits?: number;
  policyReserves?: number;
  periodEnd?: string;
  fiscalYear?: number;
  fiscalMonth?: number;
  fiscalPeriod?: string;
};

function prepareExtractorModule() {
  const sourcePath = path.join(process.cwd(), "scripts", "repair-sector-financials.ts");
  const tempPath = path.join(process.cwd(), "scripts", ".tmp-sector-extractor.ts");
  let source = fs.readFileSync(sourcePath, "utf8");
  source = source.replace(/main\(\)\.catch\([\s\S]*?\);\s*$/m, "");
  source += "\nexport { extractDocument, detectProfile };\n";
  fs.writeFileSync(tempPath, source);
  return tempPath;
}

function positive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function required(profile: Profile) {
  return profile === "bank"
    ? ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "loans", "deposits"]
    : ["revenue", "operatingIncome", "cash", "assets", "liabilities", "netAssets", "policyReserves"];
}

function missing(row: Json, profile: Profile) {
  return required(profile).filter((key) => !positive(row[key]));
}

function periodKey(row: Json) {
  return String(row.periodEnd ?? row.period_end ?? row.fiscalYear ?? row.fiscal_year ?? "");
}

async function main() {
  const tempPath = prepareExtractorModule();
  const extractor = await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`) as {
    extractDocument: (docID: string, profile: Profile) => Extracted;
    detectProfile: (company: Company) => string;
  };

  try {
    const [companies, analyses, periods] = await Promise.all([
      loadAllSupabaseRows<Company>("金融会社取得失敗", (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select("id, ticker, company_name, industry_name, market_segment, is_financial")
          .eq("is_financial", true)
          .order("ticker", { ascending: true })
          .range(from, to)
      ),
      loadAllSupabaseRows<Analysis>("分析取得失敗", (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, financials, history")
          .order("ticker", { ascending: true })
          .range(from, to)
      ),
      loadAllSupabaseRows<Period>("金融履歴取得失敗", (from, to) =>
        supabaseAdmin
          .from("company_financial_periods")
          .select("company_id, fiscal_year, period_end, document_id, financials")
          .order("period_end", { ascending: false })
          .range(from, to)
      ),
    ]);

    const analysisMap = new Map(analyses.map((row) => [row.ticker, row]));
    const periodsByCompany = new Map<string, Period[]>();
    for (const row of periods) {
      const current = periodsByCompany.get(row.company_id) ?? [];
      current.push(row);
      periodsByCompany.set(row.company_id, current);
    }

    const results: Json[] = [];
    let repaired = 0;
    let skippedLessThanThree = 0;
    let failed = 0;

    console.log("===== 銀行・保険 3期統一＋ゼロ値再取得 =====");
    console.log({ targets: companies.length });

    for (const company of companies) {
      const detected = extractor.detectProfile(company);
      if (detected !== "bank" && detected !== "insurance") continue;
      const profile = detected as Profile;
      const sourcePeriods = (periodsByCompany.get(company.id) ?? [])
        .filter((row) => Boolean(row.document_id))
        .sort((a, b) => b.period_end.localeCompare(a.period_end));

      const uniqueDocs = Array.from(new Map(sourcePeriods.map((row) => [row.document_id, row])).values());
      if (uniqueDocs.length < 3) {
        skippedLessThanThree += 1;
        results.push({ ticker: company.ticker, status: "insufficient-documents", documents: uniqueDocs.length });
        console.log(`[SKIP] ${company.ticker} 書類${uniqueDocs.length}期`);
        continue;
      }

      try {
        const rebuilt: Extracted[] = [];
        const diagnostics: Json[] = [];
        for (const period of uniqueDocs) {
          try {
            const extracted = extractor.extractDocument(period.document_id, profile);
            const absent = missing(extracted, profile);
            diagnostics.push({ documentId: period.document_id, periodEnd: period.period_end, missing: absent });
            if (absent.length === 0) {
              rebuilt.push({
                ...extracted,
                docID: period.document_id,
                documentId: period.document_id,
                periodEnd: extracted.periodEnd ?? period.period_end,
                fiscalYear: extracted.fiscalYear ?? period.fiscal_year,
              });
            }
          } catch (error) {
            diagnostics.push({ documentId: period.document_id, error: error instanceof Error ? error.message : String(error) });
          }
          if (rebuilt.length === 3) break;
        }

        if (rebuilt.length < 3) {
          throw new Error(`有効な非ゼロ期間が${rebuilt.length}期: ${JSON.stringify(diagnostics)}`);
        }

        const history = rebuilt.sort((a, b) => periodKey(a).localeCompare(periodKey(b)));
        const latest = history.at(-1)!;
        const analysis = analysisMap.get(company.ticker);
        const scores = calculateMarketScores(
          company.market_segment,
          (analysis?.financials ?? latest) as Parameters<typeof calculateMarketScores>[1],
          history as Parameters<typeof calculateMarketScores>[2]
        );

        for (const row of history) {
          const documentId = String(row.documentId ?? row.docID);
          const { error } = await supabaseAdmin
            .from("company_financial_periods")
            .update({ financials: row, data_quality: "reviewed", updated_at: new Date().toISOString() })
            .eq("company_id", company.id)
            .eq("document_id", documentId);
          if (error) throw new Error(`期間更新失敗 ${documentId}: ${error.message}`);
        }

        const { error: analysisError } = await supabaseAdmin
          .from("company_analyses")
          .update({
            history,
            score: scores.totalScore,
            score_breakdown: {
              growth: scores.growthScore,
              quality: scores.qualityScore,
              safety: scores.safetyScore,
              completenessPenalty: scores.completenessPenalty,
            },
          })
          .eq("ticker", company.ticker);
        if (analysisError) throw new Error(`分析更新失敗: ${analysisError.message}`);

        repaired += 1;
        results.push({ ticker: company.ticker, status: "repaired", periods: 3 });
        console.log(`[OK] ${company.ticker} 3期・必須項目ゼロなし`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        results.push({ ticker: company.ticker, status: "failed", error: message });
        console.error(`[FAIL] ${company.ticker}: ${message}`);
      }
    }

    const reportPath = path.join(process.cwd(), "logs", `financial-history-three-periods-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), repaired, skippedLessThanThree, failed, results }, null, 2));

    console.log("===== 金融履歴修復結果 =====");
    console.log({ repaired, skippedLessThanThree, failed, reportPath });
    if (failed > 0) process.exitCode = 1;
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
