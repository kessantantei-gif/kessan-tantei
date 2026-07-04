import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";
import { supabaseAdmin } from "../lib/supabase";

dotenv.config({ path: ".env.local" });

type GrowthCompany = {
  ticker: string;
  name: string;
  secCode?: string | null;
  edinetCode?: string | null;
  edinetMatchedDocID?: string | null;
};

type EdinetDocument = {
  docID?: string;
  secCode?: string;
  filerName?: string;
  edinetCode?: string;
  docTypeCode?: string;
  formCode?: string;
};

const days = Number(process.env.DAYS || 7);
const waitMs = Number(process.env.WAIT_MS || 5000);
const dryRun = process.env.DRY_RUN === "1";

const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

if (!fs.existsSync(masterPath)) {
  throw new Error("data/growth-companies.json が見つかりません");
}

const apiKey = process.env.EDINET_API_KEY;

if (!apiKey) {
  throw new Error("EDINET_API_KEY が設定されていません");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function quote(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function normalizeSecCode(ticker: string) {
  return `${ticker}0`;
}

function isAnnualReport(doc: EdinetDocument) {
  return doc.docTypeCode === "120";
}

async function fetchEdinetDocs(date: string): Promise<EdinetDocument[]> {
  const url =
    `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2` +
    `&Subscription-Key=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`EDINET list failed: ${date} status=${response.status}`);
  }

  const json = await response.json();

  return json.results ?? [];
}

async function insertUpdateLog(input: {
  title: string;
  body: string;
  status?: "info" | "success" | "warning" | "error";
}) {
  const { error } = await supabaseAdmin.from("update_logs").insert({
    title: input.title,
    body: input.body,
    status: input.status ?? "info",
  });

  if (error) {
    console.error("update_logs insert failed:", error.message);
  }
}

async function main() {
  const companies = JSON.parse(
    fs.readFileSync(masterPath, "utf8")
  ) as GrowthCompany[];

  console.log("===== Daily Growth Update Start =====");
  console.log("Master:", companies.length);
  console.log("Scan days:", days);
  console.log("Dry run:", dryRun);

  const bySecCode = new Map<string, GrowthCompany>();

  for (const company of companies) {
    const secCode = company.secCode || normalizeSecCode(company.ticker);
    bySecCode.set(secCode, company);
  }

  const foundUpdates: {
    company: GrowthCompany;
    oldDocID: string | null | undefined;
    newDocID: string;
    date: string;
  }[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const dateText = formatDate(date);

    console.log(`scan ${i + 1}/${days}: ${dateText}`);

    try {
      const docs = await fetchEdinetDocs(dateText);

      for (const doc of docs) {
        if (!isAnnualReport(doc)) continue;
        if (!doc.secCode || !doc.docID) continue;

        const company = bySecCode.get(doc.secCode);

        if (!company) continue;

        if (company.edinetMatchedDocID !== doc.docID) {
          foundUpdates.push({
            company,
            oldDocID: company.edinetMatchedDocID,
            newDocID: doc.docID,
            date: dateText,
          });
        }
      }
    } catch (error) {
      console.log("scan failed:", dateText);
      console.log(error);
    }

    await sleep(1000);
  }

  console.log("Found updates:", foundUpdates.length);

  if (foundUpdates.length === 0) {
    await insertUpdateLog({
      title: "日次更新チェック完了",
      body: `直近${days}日で新しい有価証券報告書は見つかりませんでした。`,
      status: "info",
    });

    console.log("No updates.");
    return;
  }

  let success = 0;
  let failed = 0;

  for (const update of foundUpdates) {
    const { company, oldDocID, newDocID, date } = update;

    console.log("\n====================================");
    console.log(`${company.ticker} ${company.name}`);
    console.log("old:", oldDocID);
    console.log("new:", newDocID);
    console.log("date:", date);

    if (dryRun) {
      console.log("DRY RUN: skip analyze");
      continue;
    }

    try {
      company.edinetMatchedDocID = newDocID;

      fs.writeFileSync(masterPath, JSON.stringify(companies, null, 2));

      execSync(
        `COMPANY_NAME=${quote(company.name)} TICKER=${company.ticker} DOC_ID=${newDocID} npx tsx scripts/analyze-company.ts`,
        { stdio: "inherit" }
      );

      await insertUpdateLog({
        title: `${company.name}を更新`,
        body: `${company.ticker}: 新しい有価証券報告書 ${newDocID} を解析しました。`,
        status: "success",
      });

      success += 1;
    } catch (error) {
      console.log("FAILED:", company.ticker);
      console.log(error);

      await insertUpdateLog({
        title: `${company.name}の更新に失敗`,
        body: `${company.ticker}: ${newDocID} の解析に失敗しました。`,
        status: "error",
      });

      failed += 1;
    }

    console.log(`WAIT ${waitMs / 1000}s`);
    await sleep(waitMs);
  }

  console.log("\n===== Daily Growth Update Done =====");
  console.log("Updates:", foundUpdates.length);
  console.log("Success:", success);
  console.log("Failed:", failed);
}

main().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
  process.exit(1);
});