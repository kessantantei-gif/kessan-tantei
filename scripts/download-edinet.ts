import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const docID = process.env.DOC_ID;
const forceDownload = process.env.FORCE_DOWNLOAD === "1";

if (!docID) throw new Error("DOC_ID がありません");

const MAX_RETRIES = 6;
const MIN_REQUEST_INTERVAL_MS = 2500;
const LOCK_TIMEOUT_MS = 180000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidZip(filePath: string) {
  if (!fs.existsSync(filePath)) return false;
  const buffer = fs.readFileSync(filePath);
  return buffer.length > 4 && buffer.subarray(0, 2).toString() === "PK";
}

function readNumber(filePath: string) {
  try {
    const value = Number(fs.readFileSync(filePath, "utf8"));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

async function acquireLock(lockDir: string) {
  const startedAt = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lockDir);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;

      try {
        const age = Date.now() - fs.statSync(lockDir).mtimeMs;
        if (age > LOCK_TIMEOUT_MS) {
          fs.rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {}

      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error("EDINETダウンロード共有ロックの取得がタイムアウトしました");
      }
      await sleep(500);
    }
  }
}

function releaseLock(lockDir: string) {
  fs.rmSync(lockDir, { recursive: true, force: true });
}

async function downloadEdinet() {
  const apiKey = process.env.EDINET_API_KEY;
  if (!apiKey) throw new Error("EDINET_API_KEY が設定されていません");

  const outputDir = path.join(process.cwd(), "downloads");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${docID}.zip`);
  const tempPath = path.join(outputDir, `${docID}.zip.tmp`);
  const lockDir = path.join(outputDir, ".edinet-download.lock");
  const lastRequestPath = path.join(outputDir, ".edinet-last-request");
  const cooldownPath = path.join(outputDir, ".edinet-cooldown-until");

  if (!forceDownload && isValidZip(outputPath)) {
    console.log("既存ZIPを使用:", outputPath);
    return;
  }

  const url =
    `https://api.edinet-fsa.go.jp/api/v2/documents/${docID}` +
    `?type=1&Subscription-Key=${apiKey}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    await acquireLock(lockDir);
    try {
      if (!forceDownload && isValidZip(outputPath)) {
        console.log("既存ZIPを使用:", outputPath);
        return;
      }

      const now = Date.now();
      const cooldownUntil = readNumber(cooldownPath);
      const lastRequestAt = readNumber(lastRequestPath);
      const waitUntil = Math.max(
        cooldownUntil,
        lastRequestAt + MIN_REQUEST_INTERVAL_MS
      );

      if (waitUntil > now) {
        const waitMs = waitUntil - now;
        console.log(`EDINET共有待機: ${Math.ceil(waitMs / 1000)}秒`);
        await sleep(waitMs);
      }

      console.log(`ダウンロード開始: ${docID} (${attempt}/${MAX_RETRIES})`);
      fs.writeFileSync(lastRequestPath, String(Date.now()));
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

      const response = await fetch(url, {
        headers: { "user-agent": "kessan-tantei-edinet-downloader/4.0" },
      });
      const contentType = response.headers.get("content-type") || "";
      const buffer = Buffer.from(await response.arrayBuffer());

      const isZip =
        response.ok &&
        buffer.length > 4 &&
        buffer.subarray(0, 2).toString() === "PK";

      if (isZip) {
        fs.writeFileSync(tempPath, buffer);
        fs.renameSync(tempPath, outputPath);
        fs.writeFileSync(cooldownPath, "0");
        console.log("保存成功:", outputPath);
        return;
      }

      const preview = buffer.toString("utf8", 0, Math.min(buffer.length, 500));
      const is429 =
        response.status === 429 ||
        preview.includes("Too Many Requests") ||
        preview.includes('"StatusCode":"429"') ||
        preview.includes('"statusCode":"429"');

      if (is429) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        const baseWaitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : Math.min(300000, 60000 * attempt);
        const jitterMs = Math.floor(Math.random() * 15000);
        const waitMs = baseWaitMs + jitterMs;
        fs.writeFileSync(cooldownPath, String(Date.now() + waitMs));
        console.log(
          `429検出。全ワーカーを約${Math.ceil(waitMs / 1000)}秒停止します。`
        );
        continue;
      }

      throw new Error(
        `ZIPではありません。status=${response.status} content-type=${contentType}\npreview=${preview}`
      );
    } finally {
      releaseLock(lockDir);
    }
  }

  throw new Error(`Download failed after ${MAX_RETRIES} retries: ${docID}`);
}

downloadEdinet().catch((error) => {
  console.error(error);
  process.exit(1);
});
