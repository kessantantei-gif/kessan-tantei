import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const docID = process.env.DOC_ID;
const forceDownload = process.env.FORCE_DOWNLOAD === "1";

if (!docID) {
  throw new Error("DOC_ID がありません");
}

const MAX_RETRIES = 20;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidZip(filePath: string) {
  if (!fs.existsSync(filePath)) return false;
  const buffer = fs.readFileSync(filePath);
  return buffer.length > 4 && buffer.subarray(0, 2).toString() === "PK";
}

async function downloadEdinet() {
  const apiKey = process.env.EDINET_API_KEY;
  if (!apiKey) throw new Error("EDINET_API_KEY が設定されていません");

  const outputDir = path.join(process.cwd(), "downloads");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${docID}.zip`);
  const tempPath = path.join(outputDir, `${docID}.zip.tmp`);

  if (!forceDownload && isValidZip(outputPath)) {
    console.log("既存ZIPを使用:", outputPath);
    return;
  }

  const url =
    `https://api.edinet-fsa.go.jp/api/v2/documents/${docID}` +
    `?type=1&Subscription-Key=${apiKey}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`ダウンロード開始: ${docID} (${attempt}/${MAX_RETRIES})`);

    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());

    const isZip =
      response.ok &&
      buffer.length > 4 &&
      buffer.subarray(0, 2).toString() === "PK";

    if (isZip) {
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, outputPath);
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
      const waitMs = Math.min(120000, attempt * 30000);
      console.log(`429検出。${Math.round(waitMs / 1000)}秒待機します。`);
      await sleep(waitMs);
      continue;
    }

    throw new Error(
      `ZIPではありません。status=${response.status} content-type=${contentType}\npreview=${preview}`
    );
  }

  throw new Error(`Download failed after ${MAX_RETRIES} retries: ${docID}`);
}

downloadEdinet().catch((error) => {
  console.error(error);
  process.exit(1);
});