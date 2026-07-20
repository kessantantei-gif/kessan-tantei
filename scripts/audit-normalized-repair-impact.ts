import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;

type RepairResult = {
  ticker?: unknown;
  companyName?: unknown;
  status?: unknown;
  latestChanges?: unknown;
  historyChanges?: unknown;
};

type RepairReport = {
  generatedAt?: unknown;
  repairedCompanies?: unknown;
  repairedLatestFields?: unknown;
  repairedHistoryFields?: unknown;
  unresolvedCompanies?: unknown;
  results?: unknown;
};

type AuditIssue = {
  ticker?: unknown;
};

type AuditReport = {
  generatedAt?: unknown;
  incorrectValues?: unknown;
  threePeriodShortage?: unknown;
};

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function latestFile(prefix: string) {
  const logsDir = path.join(process.cwd(), "logs");
  const files = fs
    .readdirSync(logsDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => ({
      name,
      fullPath: path.join(logsDir, name),
      mtimeMs: fs.statSync(path.join(logsDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (files.length === 0) throw new Error(`${prefix} のレポートが見つかりません`);
  return files[0].fullPath;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function tickerOf(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const ticker = (value as { ticker?: unknown }).ticker;
  return typeof ticker === "string" ? ticker : "";
}

function countByField(results: RepairResult[]) {
  const latest = new Map<string, number>();
  const history = new Map<string, number>();

  for (const result of results) {
    for (const field of asArray(result.latestChanges)) {
      if (typeof field !== "string") continue;
      latest.set(field, (latest.get(field) ?? 0) + 1);
    }

    for (const change of asArray(result.historyChanges)) {
      if (!change || typeof change !== "object") continue;
      for (const field of asArray((change as { fields?: unknown }).fields)) {
        if (typeof field !== "string") continue;
        history.set(field, (history.get(field) ?? 0) + 1);
      }
    }
  }

  const sort = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));

  return { latest: sort(latest), history: sort(history) };
}

function main() {
  const repairReportPath = arg("repair-report") || latestFile("repair-from-normalized-");
  const auditReportPath = arg("audit-report") || latestFile("targeted-financial-repair-audit-v4-");

  const repair = readJson<RepairReport>(repairReportPath);
  const audit = readJson<AuditReport>(auditReportPath);

  const repairedResults = asArray(repair.results)
    .filter((row): row is RepairResult => Boolean(row && typeof row === "object"))
    .filter((row) => row.status === "repaired");

  const intendedTickers = new Set([
    ...asArray(audit.incorrectValues).map(tickerOf),
    ...asArray(audit.threePeriodShortage).map(tickerOf),
  ].filter(Boolean));

  const repairedTickers = new Set(repairedResults.map(tickerOf).filter(Boolean));
  const outsideIntended = repairedResults.filter((row) => {
    const ticker = tickerOf(row);
    return ticker && !intendedTickers.has(ticker);
  });
  const insideIntended = repairedResults.filter((row) => {
    const ticker = tickerOf(row);
    return ticker && intendedTickers.has(ticker);
  });
  const intendedNotRepaired = [...intendedTickers].filter((ticker) => !repairedTickers.has(ticker));

  const fieldCounts = countByField(repairedResults);
  const outsideFieldCounts = countByField(outsideIntended);

  const summary = {
    readOnly: true,
    repairReportPath,
    auditReportPath,
    intendedTargets: intendedTickers.size,
    repairedCompanies: repairedTickers.size,
    insideIntended: insideIntended.length,
    outsideIntended: outsideIntended.length,
    intendedNotRepaired: intendedNotRepaired.length,
    reportedLatestFields: repair.repairedLatestFields ?? null,
    reportedHistoryFields: repair.repairedHistoryFields ?? null,
  };

  const outputPath = path.join(
    process.cwd(),
    "logs",
    `normalized-repair-impact-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ...summary,
        fieldCounts,
        outsideFieldCounts,
        outsideIntended: outsideIntended.map((row) => ({
          ticker: tickerOf(row),
          companyName: row.companyName ?? null,
          latestChanges: asArray(row.latestChanges),
          historyChanges: asArray(row.historyChanges),
        })),
        intendedNotRepaired,
      },
      null,
      2
    )
  );

  console.log("===== 正規化修復 影響範囲監査 =====");
  console.log({ ...summary, outputPath });
  console.log("最新期項目別:", fieldCounts.latest);
  console.log("履歴項目別:", fieldCounts.history);
}

main();
