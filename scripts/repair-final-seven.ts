import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { execFileSync } from "child_process";
import { parseEdinetFinancials } from "../lib/edinet-parser";
import { supabaseAdmin } from "../lib/supabase";

type Analysis = {
  ticker: string;
  company_name: string;
  doc_id: string;
  financials: Record<string, unknown> | null;
  history: Array<Record<string, unknown>> | null;
};

type Company = {
  id: string;
  ticker: string;
};

type Financials = {
  revenue: number;
  operatingIncome: number;
  operatingCF: number;
  cash: number;
  assets: number;
  liabilities: number;
  netAssets: number;
  sourceDocumentId: string;
  sourceMode: string;
  [key: string]: unknown;
};

const reportArg = process.argv.find((arg) => arg.startsWith("--report="))?.slice(9);
if (!reportArg) throw new Error("--report が必要です");

function decodeBuffer(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  const utf8 = buffer.toString("utf8");
  const replacementRatio = (utf8.match(/�/g)?.length ?? 0) / Math.max(1, utf8.length);
  if (replacementRatio < 0.001) return utf8;
  return new TextDecoder("shift_jis").decode(buffer);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function numericValues(cells: string[]) {
  return cells
    .map((cell) => cell.replace(/,/g, "").replace(/^\((.*)\)$/, "-$1").trim())
    .filter((cell) => /^-?\d+(?:\.\d+)?$/.test(cell))
    .map(Number)
    .filter((value) => Number.isFinite(value) && Math.abs(value) >= 1000)
    .sort((a, b) => Math.abs(b) - Math.abs(a));
}

const LABELS: Record<keyof Omit<Financials, "sourceDocumentId" | "sourceMode">, string[]> = {
  revenue: [
    "売上高",
    "売上収益",
    "営業収益",
    "事業収益",
    "収益合計",
    "収益",
    "net sales",
    "revenue",
    "operating revenue",
    "business revenue",
    "license revenue",
    "research revenue",
    "grant income",
    "milestone income",
  ],
  operatingIncome: [
    "営業利益",
    "営業損失",
    "経常利益",
    "経常損失",
    "税引前利益",
    "税引前損失",
    "当期利益",
    "当期損失",
    "operating profit",
    "operating loss",
    "profit before tax",
    "income before income taxes",
    "net income",
    "net loss",
  ],
  operatingCF: [
    "営業活動によるキャッシュ・フロー",
    "営業活動によるキャッシュフロー",
    "営業活動から得たキャッシュ・フロー",
    "net cash provided by operating activities",
    "net cash used in operating activities",
    "cash flows from operating activities",
  ],
  cash: [
    "現金及び現金同等物",
    "現金および現金同等物",
    "現金及び預金",
    "cash and cash equivalents",
    "cash and deposits",
  ],
  assets: ["資産合計", "総資産", "total assets", "assets total"],
  liabilities: ["負債合計", "負債総額", "total liabilities", "liabilities total"],
  netAssets: [
    "純資産合計",
    "純資産",
    "資本合計",
    "親会社の所有者に帰属する持分",
    "total equity",
    "stockholders equity",
    "shareholders equity",
  ],
};

function extractFromCsvText(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const output: Partial<Record<keyof typeof LABELS, number>> = {};
  for (const [metric, labels] of Object.entries(LABELS) as Array<[keyof typeof LABELS, string[]]>) {
    let best: number | undefined;
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (!labels.some((label) => lower.includes(label.toLowerCase()))) continue;
      if (/前期|前年|previous|prior year|forecast|予想|一株当たり|per share/i.test(lower)) continue;
      const values = numericValues(parseCsvLine(line));
      if (values.length === 0) continue;
      const candidate = values[0];
      if (best === undefined || Math.abs(candidate) > Math.abs(best)) best = candidate;
    }
    if (best !== undefined && best !== 0) output[metric] = best;
  }
  return output;
}

async function downloadCsvZip(docID: string) {
  const apiKey = process.env.EDINET_API_KEY;
  if (!apiKey) throw new Error("EDINET_API_KEY がありません");
  const dir = path.join(process.cwd(), "downloads", "csv");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${docID}.zip`);
  if (fs.existsSync(filePath)) return filePath;
  const url = `https://api.edinet-fsa.go.jp/api/v2/documents/${docID}?type=5&Subscription-Key=${apiKey}`;
  const response = await fetch(url, { headers: { "user-agent": "kessan-tantei-csv-repair/1.0" } });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok || buffer.subarray(0, 2).toString() !== "PK") {
    const preview = buffer.toString("utf8", 0, 300);
    throw new Error(`CSV取得失敗 status=${response.status} ${preview}`);
  }
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function parseCsvPackage(docID: string) {
  const zipPath = await downloadCsvZip(docID);
  const zip = new AdmZip(zipPath);
  const merged: Partial<Record<keyof typeof LABELS, number>> = {};
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !/\.csv$/i.test(entry.entryName)) continue;
    const extracted = extractFromCsvText(decodeBuffer(entry.getData()));
    for (const [key, value] of Object.entries(extracted) as Array<[keyof typeof LABELS, number]>) {
      if (value !== 0 && (merged[key] === undefined || Math.abs(value) > Math.abs(merged[key]!))) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function fetchHistoryDocIDs(companyName: string) {
  try {
    const output = execFileSync("npx", ["tsx", "scripts/fetch-history.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, COMPANY_NAME: companyName },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return Array.from(new Set([...output.matchAll(/S100[A-Z0-9]+/g)].map((match) => match[0]))).slice(0, 12);
  } catch {
    return [];
  }
}

function ensureType1(docID: string) {
  const filePath = path.join(process.cwd(), "downloads", `${docID}.zip`);
  if (fs.existsSync(filePath)) return;
  execFileSync("npx", ["tsx", "scripts/download-edinet.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, DOC_ID: docID },
  });
}

function merge(base: Record<string, unknown>, parsed: Record<string, unknown>, csv: Record<string, unknown>, docID: string): Financials {
  const number = (key: string) => {
    const values = [csv[key], parsed[key], base[key]];
    const found = values.find((value) => typeof value === "number" && Number.isFinite(value) && value !== 0);
    return typeof found === "number" ? found : 0;
  };
  let assets = number("assets");
  let liabilities = number("liabilities");
  const netAssets = number("netAssets");
  if (!liabilities && assets && netAssets) liabilities = assets - netAssets;
  if (!assets && liabilities && netAssets) assets = liabilities + netAssets;
  return {
    ...base,
    ...parsed,
    ...csv,
    revenue: number("revenue"),
    operatingIncome: number("operatingIncome"),
    operatingCF: number("operatingCF"),
    cash: number("cash"),
    assets,
    liabilities,
    netAssets,
    sourceDocumentId: docID,
    sourceMode: "xbrl+edinet-csv",
  };
}

function missing(financials: Financials) {
  return ["revenue", "operatingIncome", "operatingCF", "cash", "assets", "liabilities", "netAssets"].filter(
    (key) => typeof financials[key] !== "number" || !Number.isFinite(financials[key] as number) || financials[key] === 0
  );
}

async function main() {
  const report = JSON.parse(fs.readFileSync(reportArg, "utf8")) as {
    results?: Array<{ ticker?: string; status?: string }>;
  };
  const tickers = Array.from(
    new Set((report.results ?? []).filter((row) => row.status === "failed").map((row) => row.ticker).filter(Boolean))
  ) as string[];

  const { data: analyses, error: analysesError } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, doc_id, financials, history")
    .in("ticker", tickers);
  if (analysesError) throw analysesError;

  const { data: companies, error: companiesError } = await supabaseAdmin
    .from("all_market_companies")
    .select("id, ticker")
    .in("ticker", tickers);
  if (companiesError) throw companiesError;
  const companyMap = new Map((companies as Company[]).map((row) => [row.ticker, row]));

  const results: Array<Record<string, unknown>> = [];
  for (const row of analyses as Analysis[]) {
    const historyIDs = (row.history ?? []).map((item) => String(item.docID ?? item.documentId ?? "")).filter(Boolean);
    const candidateIDs = Array.from(new Set([row.doc_id, ...historyIDs, ...fetchHistoryDocIDs(row.company_name)])).slice(0, 12);
    let best: Financials | null = null;
    let bestMissing = Number.POSITIVE_INFINITY;
    const diagnostics: Array<Record<string, unknown>> = [];

    for (const docID of candidateIDs) {
      try {
        ensureType1(docID);
        let parsed: Record<string, unknown> = {};
        try {
          parsed = parseEdinetFinancials(docID) as unknown as Record<string, unknown>;
        } catch {}
        let csv: Record<string, unknown> = {};
        try {
          csv = (await parseCsvPackage(docID)) as Record<string, unknown>;
        } catch (csvError) {
          diagnostics.push({ docID, csvError: csvError instanceof Error ? csvError.message : String(csvError) });
        }
        const candidate = merge(row.financials ?? {}, parsed, csv, docID);
        const candidateMissing = missing(candidate);
        diagnostics.push({ docID, missing: candidateMissing, values: candidate });
        if (candidateMissing.length < bestMissing) {
          best = candidate;
          bestMissing = candidateMissing.length;
        }
        if (candidateMissing.length === 0) break;
      } catch (error) {
        diagnostics.push({ docID, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (!best || bestMissing > 0) {
      console.error(`[FAIL] ${row.ticker} ${row.company_name}: ${JSON.stringify(diagnostics)}`);
      results.push({ ticker: row.ticker, companyName: row.company_name, status: "failed", diagnostics });
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("company_analyses")
      .update({ financials: best })
      .eq("ticker", row.ticker);
    if (updateError) throw updateError;

    const company = companyMap.get(row.ticker);
    if (company) {
      await supabaseAdmin
        .from("company_financial_periods")
        .update({ financials: best, data_quality: "reviewed", updated_at: new Date().toISOString() })
        .eq("company_id", company.id)
        .eq("document_id", best.sourceDocumentId);
    }

    console.log(`[OK] ${row.ticker} ${row.company_name} source=${best.sourceDocumentId}`);
    results.push({ ticker: row.ticker, companyName: row.company_name, status: "repaired", financials: best });
  }

  const failed = results.filter((row) => row.status === "failed");
  const outputPath = path.join(process.cwd(), "logs", `final-seven-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), targets: tickers.length, repaired: results.length - failed.length, failed: failed.length, results }, null, 2));
  console.log("===== 最終7社修復結果 =====");
  console.log({ targets: tickers.length, repaired: results.length - failed.length, failed: failed.length, reportPath: outputPath });
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
