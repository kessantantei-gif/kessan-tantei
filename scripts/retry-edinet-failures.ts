import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const logDir = path.join(process.cwd(), "logs");
  fs.mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, `edinet-retry-${timestamp()}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const command = process.platform === "win32" ? "npx.cmd" : "npx";

  console.log("===== EDINET Failed Companies Retry =====");
  console.log("成功済み企業はDB判定で自動スキップします。");
  console.log("Concurrency: 1");
  console.log("Log:", logPath);

  const forwarded = process.argv.slice(2).filter(
    (value) => !value.startsWith("--concurrency=")
  );

  const child = spawn(
    command,
    [
      "tsx",
      "scripts/run-edinet-backfill-safe.ts",
      "--days=400",
      "--continue-on-error",
      "--concurrency=1",
      ...forwarded,
    ],
    {
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    }
  );

  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    logStream.write(chunk);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    logStream.write(chunk);
  });

  child.on("error", (error) => {
    logStream.end();
    throw error;
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("close", resolve);
  });

  await new Promise<void>((resolve) => logStream.end(resolve));

  console.log("\n===== Retry Finished =====");
  console.log("Exit code:", exitCode ?? "unknown");
  console.log("Complete log:", logPath);

  process.exit(exitCode ?? 1);
}

main().catch((error) => {
  console.error("EDINET失敗企業の再試行に失敗しました。");
  console.error(error);
  process.exit(1);
});
