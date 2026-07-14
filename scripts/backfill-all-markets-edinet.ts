import { spawnSync } from "node:child_process";

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

const end = toDate(parseArgument("end") ?? new Date().toISOString().slice(0, 10));
const explicitStart = parseArgument("start");
const days = Number(parseArgument("days") ?? "400");

const start = explicitStart
  ? toDate(explicitStart)
  : new Date(end.getTime() - Math.max(1, days - 1) * 24 * 60 * 60 * 1000);

if (start > end) throw new Error("startはend以前にしてください");

const continueOnError = process.argv.includes("--continue-on-error");
const failures: Array<{ date: string; exitCode: number | null }> = [];
let processed = 0;

console.log("===== All Markets EDINET Backfill =====");
console.log("Start:", formatDate(start));
console.log("End:", formatDate(end));
console.log("Continue on error:", continueOnError);

for (
  let cursor = new Date(start);
  cursor <= end;
  cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
) {
  const day = cursor.getUTCDay();
  if (day === 0 || day === 6) continue;

  const date = formatDate(cursor);
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
console.log("Failures:", failures.length);
for (const failure of failures.slice(0, 50)) {
  console.log(`- ${failure.date}: exit ${failure.exitCode ?? "unknown"}`);
}

if (failures.length > 0) process.exit(1);
