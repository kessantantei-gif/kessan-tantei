import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";

const apiKey = process.env.EDINET_API_KEY;
if (!apiKey) throw new Error("EDINET_API_KEY missing");

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasResults(date: string) {
  const url = new URL("https://disclosure.edinet-fsa.go.jp/api/v2/documents.json");
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", apiKey!);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": "kessan-tantei-edinet-backfill-preflight/1.0" },
    });

    const text = await response.text();
    if (response.ok) {
      try {
        const json = JSON.parse(text) as { results?: unknown[] };
        if (Array.isArray(json.results)) return true;
      } catch {
        // retry below
      }
    }

    if (attempt < 3) await sleep(attempt * 2000);
  }

  return false;
}

async function main() {
  const explicitEnd = process.argv.find((value) => value.startsWith("--end="));
  if (explicitEnd) {
    const result = spawnSync("npx", ["tsx", "scripts/backfill-all-markets-edinet.ts", ...process.argv.slice(2)], {
      stdio: "inherit",
      env: process.env,
    });
    process.exit(result.status ?? 1);
  }

  let cursor = new Date();
  let detected: string | null = null;

  for (let offset = 0; offset < 10; offset += 1) {
    const date = formatDate(cursor);
    console.log(`EDINET利用可能日確認: ${date}`);
    if (await hasResults(date)) {
      detected = date;
      break;
    }
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  if (!detected) {
    throw new Error("直近10日以内に利用可能なEDINET書類一覧を確認できませんでした");
  }

  console.log(`EDINETバックフィル終了日: ${detected}`);
  const forwarded = process.argv.slice(2).filter((value) => !value.startsWith("--end="));
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/backfill-all-markets-edinet.ts", `--end=${detected}`, ...forwarded],
    { stdio: "inherit", env: process.env }
  );

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error("EDINETバックフィル事前確認に失敗しました。");
  console.error(error);
  process.exit(1);
});
