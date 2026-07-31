import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "../lib/supabase";

type Fact = { name: string; value: string; contextRef: string | null; scale: string | null };

function localName(name: string) {
  return name.includes(":") ? name.split(":").at(-1)! : name;
}

function nodeText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  const record = node as Record<string, unknown>;
  return Object.entries(record)
    .filter(([key]) => !key.startsWith("@_") && !/^(?:ix:)?exclude$/i.test(key))
    .map(([, value]) => nodeText(value))
    .join("");
}

function collectFacts(node: unknown, facts: Fact[], inheritedName = "") {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectFacts(item, facts, inheritedName);
    return;
  }
  const record = node as Record<string, unknown>;
  const inlineConcept = typeof record["@_name"] === "string" ? record["@_name"] : null;
  const factName = inlineConcept ?? inheritedName;
  if (factName && (inlineConcept !== null || "#text" in record)) {
    const value = nodeText(record).trim();
    if (value) {
      facts.push({
        name: localName(factName),
        value,
        contextRef: typeof record["@_contextRef"] === "string" ? record["@_contextRef"] : null,
        scale: record["@_scale"] == null ? null : String(record["@_scale"]),
      });
    }
  }
  if (inlineConcept) return;
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@_") || key === "#text") continue;
    collectFacts(value, facts, key);
  }
}

async function main() {
  const { data: disclosures, error: disclosureError } = await supabaseAdmin
    .from("company_disclosures")
    .select("id, title, disclosed_at, source_document_id, xbrl_url, fiscal_period_end, quarter, accounting_scope, raw_payload")
    .eq("source", "tdnet")
    .eq("ticker", "2751")
    .gte("disclosed_at", "2026-07-28T00:00:00+09:00")
    .lt("disclosed_at", "2026-07-29T00:00:00+09:00");
  if (disclosureError) throw disclosureError;

  const { data: quarterly, error: quarterlyError } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select("ticker, fiscal_period_end, quarter, accounting_scope, revenue, operating_income, ordinary_income, profit_attributable_to_owners, raw_financials")
    .eq("ticker", "2751")
    .eq("fiscal_period_end", "2026-04-30")
    .eq("quarter", 4);
  if (quarterlyError) throw quarterlyError;

  console.log("DISCLOSURES", JSON.stringify(disclosures, null, 2));
  console.log("QUARTERLY", JSON.stringify(quarterly, null, 2));

  for (const disclosure of disclosures ?? []) {
    if (!disclosure.xbrl_url) continue;
    const response = await fetch(disclosure.xbrl_url);
    if (!response.ok) throw new Error(`XBRL download failed ${response.status}`);
    const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory && /(?:ixbrl\.html?|\.xbrl$)/i.test(entry.entryName));
    console.log("ENTRIES", entries.map((entry) => entry.entryName));

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      parseTagValue: false,
      trimValues: true,
    });
    const facts: Fact[] = [];
    for (const entry of entries) {
      collectFacts(parser.parse(entry.getData().toString("utf8")), facts);
    }
    const relevant = facts.filter((fact) =>
      /sales|revenue|income|profit|loss|ordinary|operating|netassets|assets/i.test(fact.name)
    );
    console.log("RELEVANT_FACTS", JSON.stringify(relevant.slice(0, 500), null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
