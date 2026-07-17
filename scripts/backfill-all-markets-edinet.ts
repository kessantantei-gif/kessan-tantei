import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";

function parseArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function toDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`日付形式が不正です: ${value}`);
  return date;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function loadCompletedDates() {
  const completed = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("data_import_runs")
      .select("status, metadata")
      .eq("import_type", "edinet_daily_all_markets")
      .eq("status", "success")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`完了済みバックフィル履歴の取得に失敗しました: ${error.message}`);
    }

    for (const row of data ?? []) {
      const date = row.metadata?.date;
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        completed.add(date);
      }
    }

    if ((data ?? []).length < pageSize) break;
  }

  return completed;
}

async function main() {
  const end = toDate(parseArgument("end") ?? new Date().toISOString().slice(0, 10));
  const explicitStart = parseArgument("start");
  const days = Number(parseArgument("days") ?? "400");
  const start = explicitStart
    ? toDate(explicitStart)
    : new Date(end.getTime() - Math.max(1, days - 1) * 24 * 60 * 60 * 1000);

  if (start > end) throw new Error("startはend以前にしてください");

  const continueOnError = process.argv.includes("--continue-on-error");
  const force = process.argv.includes("--force");
  const completedDates = force ? new Set<string>() : await loadCompletedDates();
  const failures: Array<{ date: string; exitCode: number | null }> = [];
  let processed = 0;
  let skipped = 0;

  console.log("===== All Markets EDINET Backfill =====");
  console.log("Start:", formatDate(start));
  console.log("End:", formatDate(end));
  console.log("Continue on error:", continueOnError);
  console.log("Resume completed dates:", !force);
  console.log("Already completed:", completedDates.size);

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;

    const date = formatDate(cursor);
    if (completedDates.has(date)) {
      console.log(`SKIP completed date: ${date}`);
      skipped += 1;
      continue;
    }

    console.log(`\n===== ${date} =====`);

    const result = spawnSync("npx", ["tsx", "scripts/sync-daily-edinet.ts", date], {
      stdio: "inherit",
      env: process.env,
    });

    processed += 1;
    if (result.status !== 0) {
      failures.push({ date, exitCode: result.status });
      if (!continueOnError) break;
    }
  }

  console.log("\n===== Backfill Summary =====");
  console.log("Processed business days:", processed);
  console.log("Skipped completed days:", skipped);
  console.log("Failures:", failures.length);
  for (const failure of failures.slice(0, 50)) {
    console.log(`- ${failure.date}: exit ${failure.exitCode ?? "unknown"}`);
  }

  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("全市場EDINETバックフィルに失敗しました。");
  console.error(error);
  process.exit(1);
});
