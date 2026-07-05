import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { extractFiscalPeriodsFromEdinetXbrlZip } from "../lib/edinet-financial-parser";

config({ path: ".env.local" });

const EDINET_BASE = "https://api.edinet-fsa.go.jp/api/v2";

type CompanyRow = {
  ticker: string;
  company_name: string;
  doc_id: string | null;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

async function fetchXbrlZip(docId: string) {
  const url = `${EDINET_BASE}/documents/${docId}?type=1&Subscription-Key=${requiredEnv("EDINET_API_KEY")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`EDINET XBRL fetch failed: ${docId} ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const tickerArg = process.argv.find((arg) => arg.startsWith("--ticker="));
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const ticker = tickerArg?.split("=")[1];
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 20;

  let query = supabase
    .from("company_analyses")
    .select("ticker, company_name, doc_id")
    .not("doc_id", "is", null)
    .order("ticker", { ascending: true })
    .limit(limit);

  if (ticker) query = query.eq("ticker", ticker);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as CompanyRow[];
  let ok = 0;
  let ng = 0;

  for (const row of rows) {
    try {
      if (!row.doc_id) continue;
      const zip = await fetchXbrlZip(row.doc_id);
      const periods = extractFiscalPeriodsFromEdinetXbrlZip(zip);
      const current = periods.current?.fiscalPeriod ?? "not found";
      const prior = periods.prior?.fiscalPeriod ?? "not found";
      const found = Boolean(periods.current || periods.prior);
      if (found) ok += 1;
      else ng += 1;
      console.log(`${row.ticker} ${row.company_name} doc=${row.doc_id} current=${current} prior=${prior}`);
    } catch (error) {
      ng += 1;
      console.warn(`${row.ticker} ${row.company_name} failed`, error);
    }
  }

  console.log({ checked: rows.length, ok, ng });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
