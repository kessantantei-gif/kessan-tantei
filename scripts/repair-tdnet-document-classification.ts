import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { classifyTdnetTitle } from "../lib/tdnet-document-title";
import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Disclosure = {
  id: string;
  ticker: string;
  title: string;
  disclosed_at: string;
  document_type: string;
  quarter: number | null;
  xbrl_url: string | null;
};

function todayJst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function targetRange() {
  const positional = process.argv.find((value) => DATE_PATTERN.test(value));
  const from = argumentValue("from") ?? argumentValue("date") ?? positional ?? todayJst();
  const to = argumentValue("to") ?? from;
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw new Error(`分類補正期間が不正です: ${from} - ${to}`);
  }
  return { from, to };
}

async function loadDisclosures(from: string, to: string) {
  const rows: Disclosure[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("company_disclosures")
      .select("id, ticker, title, disclosed_at, document_type, quarter, xbrl_url")
      .eq("source", "tdnet")
      .gte("disclosed_at", `${from}T00:00:00+09:00`)
      .lt("disclosed_at", `${addDays(to, 1)}T00:00:00+09:00`)
      .order("disclosed_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`TDnet開示取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Disclosure[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function main() {
  const { from, to } = targetRange();
  const disclosures = await loadDisclosures(from, to);
  const changes: Array<Record<string, unknown>> = [];

  for (const disclosure of disclosures) {
    const classification = classifyTdnetTitle(disclosure.title, disclosure.xbrl_url);
    if (classification.documentType === "other") continue;
    if (
      classification.documentType === disclosure.document_type &&
      classification.quarter === disclosure.quarter
    ) {
      continue;
    }

    const { error: disclosureError } = await supabaseAdmin
      .from("company_disclosures")
      .update({
        document_type: classification.documentType,
        quarter: classification.quarter,
        is_correction: classification.isCorrection,
        updated_at: new Date().toISOString(),
      })
      .eq("id", disclosure.id);
    if (disclosureError) {
      throw new Error(`開示分類補正失敗 ${disclosure.ticker}: ${disclosureError.message}`);
    }

    if (classification.quarter !== null) {
      const { error: quarterlyError } = await supabaseAdmin
        .from("company_quarterly_financials")
        .update({
          quarter: classification.quarter,
          updated_at: new Date().toISOString(),
        })
        .eq("disclosure_id", disclosure.id);
      if (quarterlyError) {
        throw new Error(`四半期分類補正失敗 ${disclosure.ticker}: ${quarterlyError.message}`);
      }
    }

    changes.push({
      ticker: disclosure.ticker,
      title: disclosure.title,
      fromDocumentType: disclosure.document_type,
      toDocumentType: classification.documentType,
      fromQuarter: disclosure.quarter,
      toQuarter: classification.quarter,
    });
  }

  console.log("===== TDnet document classification repair =====");
  console.log(
    JSON.stringify(
      {
        range: { from, to },
        scanned: disclosures.length,
        repaired: changes.length,
        changes,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
