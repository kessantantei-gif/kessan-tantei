import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import AdmZip from "adm-zip";
import { supabaseAdmin } from "../lib/supabase";

function clean(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const { data, error } = await supabaseAdmin
    .from("company_disclosures")
    .select("ticker, title, source_document_id, disclosed_at, quarter, xbrl_url")
    .eq("source", "tdnet")
    .in("document_type", ["q2_earnings", "annual_earnings", "correction"])
    .in("quarter", [2, 4])
    .not("xbrl_url", "is", null)
    .gte("disclosed_at", "2026-07-25T00:00:00+09:00")
    .lt("disclosed_at", "2026-08-01T00:00:00+09:00")
    .order("disclosed_at", { ascending: true });
  if (error) throw error;

  const reports: Array<Record<string, unknown>> = [];
  for (const disclosure of data ?? []) {
    const response = await fetch(disclosure.xbrl_url);
    if (!response.ok) throw new Error(`${disclosure.ticker}: XBRL ${response.status}`);
    const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
    const entries = zip
      .getEntries()
      .filter(
        (entry) =>
          !entry.isDirectory &&
          /-ixbrl\.html?$/i.test(entry.entryName) &&
          /(?:accf|qccf|cash.?flow|statementofcashflows?)/i.test(entry.entryName)
      );

    const rows: Array<{ entry: string; cells: string[] }> = [];
    for (const entry of entries) {
      const document = entry.getData().toString("utf8");
      for (const row of document.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [
          ...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi),
        ].map((match) => clean(match[1]));
        const joined = cells.join("");
        if (
          /営業活動によるキャッシュ・フロー|投資活動によるキャッシュ・フロー|財務活動によるキャッシュ・フロー|営業活動から得たキャッシュ・フロー|営業活動による現金及び現金同等物/.test(
            joined
          )
        ) {
          rows.push({ entry: entry.entryName, cells });
        }
      }
    }

    reports.push({
      ticker: disclosure.ticker,
      quarter: disclosure.quarter,
      title: disclosure.title,
      sourceDocumentId: disclosure.source_document_id,
      cashFlowEntries: entries.map((entry) => entry.entryName),
      rows,
    });
  }

  console.log(JSON.stringify({ disclosures: reports.length, reports }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
