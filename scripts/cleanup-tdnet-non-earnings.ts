import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { isTdnetNonEarningsDocument } from "../lib/tdnet-document-title";
import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Disclosure = {
  id: string;
  ticker: string;
  title: string;
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
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function targetRange() {
  const positional = process.argv.find((value) => DATE_PATTERN.test(value));
  const from = argumentValue("from") ?? argumentValue("date") ?? positional ?? todayJst();
  const to = argumentValue("to") ?? from;
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw new Error(`クリーンアップ期間が不正です: ${from} - ${to}`);
  }
  return { from, to };
}

async function main() {
  const { from, to } = targetRange();
  const rows: Disclosure[] = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("company_disclosures")
      .select("id, ticker, title, disclosed_at, xbrl_url")
      .eq("source", "tdnet")
      .not("quarter", "is", null)
      .gte("disclosed_at", `${from}T00:00:00+09:00`)
      .lt("disclosed_at", `${addDays(to, 1)}T00:00:00+09:00`)
      .order("disclosed_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`TDnet開示取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Disclosure[]));
    if ((data ?? []).length < 1000) break;
  }

  const invalid = rows.filter((row) => isTdnetNonEarningsDocument(row.title, row.xbrl_url));
  for (let offset = 0; offset < invalid.length; offset += 100) {
    const ids = invalid.slice(offset, offset + 100).map((row) => row.id);
    const { error } = await supabaseAdmin.from("company_disclosures").delete().in("id", ids);
    if (error) throw new Error(`誤分類TDnet開示削除失敗: ${error.message}`);
  }

  console.log("===== TDnet non-earnings cleanup =====");
  console.log(
    JSON.stringify(
      {
        range: { from, to },
        scanned: rows.length,
        deleted: invalid.length,
        records: invalid.map((row) => ({
          ticker: row.ticker,
          disclosedAt: row.disclosed_at,
          title: row.title,
        })),
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
