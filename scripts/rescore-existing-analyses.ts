import dotenv from "dotenv";
import { supabaseAdmin } from "../lib/supabase";
import { calculateScores } from "../lib/scoring-engine";

dotenv.config({ path: ".env.local" });

type AnalysisRow = {
  ticker: string;
  doc_id: string | null;
  financials: any;
  history: any[] | null;
};

async function main() {
  console.log("===== Rescore Existing Analyses Start =====");

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, doc_id, financials, history")
    .limit(1000);

  if (error) throw error;

  const rows = (data ?? []) as AnalysisRow[];

  console.log("Targets:", rows.length);

  let success = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      if (!row.financials) {
        throw new Error("financials がありません");
      }

      const scores = calculateScores(row.financials, row.history ?? []);

      const scoreBreakdown = {
        growth: scores.growthScore,
        quality: scores.qualityScore,
        safety: scores.safetyScore,
      };

      const { error: updateError } = await supabaseAdmin
        .from("company_analyses")
        .update({
          score: scores.totalScore,
          score_breakdown: scoreBreakdown,
        })
        .eq("ticker", row.ticker);

      if (updateError) throw updateError;

      success += 1;

      console.log(
        `UPDATED ${row.ticker}: score=${scores.totalScore} growth=${scores.growthScore} quality=${scores.qualityScore} safety=${scores.safetyScore}`
      );
    } catch (error) {
      failed += 1;
      console.log("FAILED:", row.ticker);
      console.log(error);
    }
  }

  console.log("===== Rescore Existing Analyses Done =====");
  console.log("Success:", success);
  console.log("Failed:", failed);
}

main().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
  process.exit(1);
});