import dotenv from "dotenv";
import { supabaseAdmin } from "../lib/supabase";
import { calculateScores } from "../lib/scoring-engine";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

dotenv.config({ path: ".env.local" });

type AnalysisRow = {
  ticker: string;
  financials: Record<string, unknown> | null;
  history: Record<string, unknown>[] | null;
};

async function main() {
  console.log("===== Rescore Existing Analyses Start =====");

  const rows = await loadAllSupabaseRows<AnalysisRow>("分析取得失敗", (from, to) =>
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, financials, history")
      .order("ticker", { ascending: true })
      .range(from, to)
  );

  console.log("Targets:", rows.length);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const [index, row] of rows.entries()) {
    try {
      if (!row.financials) {
        skipped += 1;
        console.log(`[${index + 1}/${rows.length}] SKIPPED ${row.ticker}: financialsなし`);
        continue;
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
        `[${index + 1}/${rows.length}] UPDATED ${row.ticker}: score=${scores.totalScore}`
      );
    } catch (error) {
      failed += 1;
      console.log(`[${index + 1}/${rows.length}] FAILED ${row.ticker}`);
      console.log(error);
    }
  }

  console.log("===== Rescore Existing Analyses Done =====");
  console.log({ targets: rows.length, success, failed, skipped });

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
  process.exit(1);
});
