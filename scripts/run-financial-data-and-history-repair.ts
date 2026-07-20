import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const target = path.join(process.cwd(), "scripts", "repair-financial-data-and-history.ts");
const original = fs.readFileSync(target, "utf8");

const fixed = original
  .replace("  period_end: string;", "  period_end: string | null;")
  .replace(
    `function uniquePeriods(rows: Period[]) {
  const byPeriod = new Map<string, Period>();
  for (const row of [...rows].sort((a, b) => b.period_end.localeCompare(a.period_end))) {
    const key = row.period_end || String(row.fiscal_year);
    if (!byPeriod.has(key)) byPeriod.set(key, row);
  }
  return [...byPeriod.values()].sort((a, b) => a.period_end.localeCompare(b.period_end));
}`,
    `function periodSortKey(row: Period) {
  return row.period_end ?? \`${String("${String(row.fiscal_year).padStart(4, \"0\")}-00-00")}\`;
}

function uniquePeriods(rows: Period[]) {
  const byPeriod = new Map<string, Period>();
  for (const row of [...rows].sort((a, b) => periodSortKey(b).localeCompare(periodSortKey(a)))) {
    const key = row.period_end ?? String(row.fiscal_year);
    if (!byPeriod.has(key)) byPeriod.set(key, row);
  }
  return [...byPeriod.values()].sort((a, b) => periodSortKey(a).localeCompare(periodSortKey(b)));
}`
  );

if (fixed === original) {
  throw new Error("null period_end 修正対象が見つかりません");
}

fs.writeFileSync(target, fixed);
try {
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/repair-financial-data-and-history.ts", ...process.argv.slice(2)],
    { cwd: process.cwd(), stdio: "inherit", env: process.env }
  );
  process.exitCode = result.status ?? 1;
} finally {
  fs.writeFileSync(target, original);
}
