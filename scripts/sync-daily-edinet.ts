import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabase } from "../lib/supabase";
import { execSync } from "child_process";

const EDINET_API_KEY = process.env.EDINET_API_KEY;
if (!EDINET_API_KEY) throw new Error("EDINET_API_KEY missing");

async function main() {
  console.log("===== Daily EDINET Sync Start =====");

  const today = new Date().toISOString().slice(0, 10);

  const url =
    `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${today}&type=2&Subscription-Key=${EDINET_API_KEY}`;

  const res = await fetch(url);
  const json = await res.json();

  if (!json.results) {
    throw new Error("documents.json取得失敗");
  }

  const annualDocs = json.results.filter(
    (doc: any) =>
      doc.docTypeCode === "120" || // 有報
      doc.docTypeCode === "130"    // 訂正有報
  );

  console.log("Annual docs today:", annualDocs.length);

  const { data: companies, error } = await supabase
    .from("companies")
    .select("ticker,name,edinet_code");

  if (error) throw error;

  const companyMap = new Map(
    companies.map((c: any) => [c.edinet_code, c])
  );

  const targets = annualDocs.filter((doc: any) =>
    companyMap.has(doc.edinetCode)
  );

  console.log("Growth targets:", targets.length);

  for (const doc of targets) {
    const company = companyMap.get(doc.edinetCode);

    const { data: existing } = await supabase
      .from("company_analyses")
      .select("doc_id")
      .eq("ticker", company.ticker)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.doc_id === doc.docID) {
      console.log(`SKIP ${company.ticker} already latest`);
      continue;
    }

    console.log(`NEW DOC: ${company.ticker} ${company.name}`);

    try {
      execSync(
        `COMPANY_NAME="${company.name}" TICKER=${company.ticker} DOC_ID=${doc.docID} npx tsx scripts/analyze-company.ts`,
        { stdio: "inherit" }
      );
    } catch (e) {
      console.log(`FAILED ${company.ticker}`);
    }

    await sleep(3000);
  }

  console.log("===== Daily EDINET Sync Done =====");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();