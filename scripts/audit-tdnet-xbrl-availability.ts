import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const operationStart = process.env.TDNET_OPERATION_START_DATE ?? "2026-07-25";

type Disclosure = {
  ticker: string;
  title: string;
  source_document_id: string;
  disclosed_at: string;
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
  return process.argv.find((value: string) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function isNonEarningsNotice(title: string) {
  const normalized = title.normalize("NFKC").replace(/\s+/g, "");
  return (
    /決算短信.*(?:開示|公表|発表).*(?:45日|超える|超過|延期|遅延|延長|予定|時期|日程|変更|見込み|未定)/.test(
      normalized
    ) ||
    /(?:45日|超える|超過|延期|遅延|延長).*(?:決算短信|決算発表)/.test(normalized) ||
    /決算発表.*(?:延期|遅延|変更|予定|時期|日程|見込み|未定)/.test(normalized)
  );
}

async function main() {
  const from = argumentValue("from") ?? operationStart;
  const to = argumentValue("to") ?? todayJst();
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw new Error(`監査期間が不正です: ${from} - ${to}`);
  }

  const rows: Disclosure[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("company_disclosures")
      .select("ticker, title, source_document_id, disclosed_at, xbrl_url")
      .eq("source", "tdnet")
      .in("document_type", [
        "q1_earnings",
        "q2_earnings",
        "q3_earnings",
        "annual_earnings",
        "correction",
      ])
      .not("quarter", "is", null)
      .gte("disclosed_at", `${from}T00:00:00+09:00`)
      .lt("disclosed_at", `${addDays(to, 1)}T00:00:00+09:00`)
      .order("disclosed_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`TDnet開示取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Disclosure[]));
    if ((data ?? []).length < 1000) break;
  }

  const actualEarnings = rows.filter((row) => !isNonEarningsNotice(row.title));
  const missingXbrl = actualEarnings.filter((row) => !row.xbrl_url);

  const report = {
    range: { from, to },
    actualEarnings: actualEarnings.length,
    xbrlAvailable: actualEarnings.length - missingXbrl.length,
    missingXbrl: missingXbrl.map((row) => ({
      ticker: row.ticker,
      sourceDocumentId: row.source_document_id,
      disclosedAt: row.disclosed_at,
      title: row.title,
    })),
  };

  console.log("===== TDnet XBRL availability audit =====");
  console.log(JSON.stringify(report, null, 2));

  if (missingXbrl.length > 0) {
    throw new Error(`実決算短信${missingXbrl.length}件でXBRLリンクがありません`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
