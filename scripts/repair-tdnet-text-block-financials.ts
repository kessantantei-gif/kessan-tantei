import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { parseTdnetTextBlockFinancials } from "../lib/tdnet-text-block-financials";
import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const userAgent = "kessan-tantei-tdnet-text-block-repair/1.0";
const TEXT_BLOCK_VERSION = "tdnet-quarterly-v4-text-block";

type Disclosure = {
  id: string;
  company_id: string;
  ticker: string;
  title: string;
  disclosed_at: string;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
  xbrl_url: string | null;
};

type QuarterlyRow = {
  id: string;
  revenue: number | null;
  operating_income: number | null;
  ordinary_income: number | null;
  profit_attributable_to_owners: number | null;
  extraction_version: string | null;
  raw_financials: Record<string, unknown> | null;
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
    throw new Error(`修復期間が不正です: ${from} - ${to}`);
  }
  return { from, to };
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

async function fetchBuffer(url: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": userAgent } });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      lastError = new Error(`${url}: HTTP ${response.status}`);
      if (![429, 500, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError instanceof Error ? lastError : new Error(`${url} の取得に失敗しました`);
}

async function loadDisclosures(from: string, to: string) {
  const rows: Disclosure[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("company_disclosures")
      .select(
        "id, company_id, ticker, title, disclosed_at, fiscal_period_end, quarter, accounting_scope, xbrl_url"
      )
      .eq("source", "tdnet")
      .in("document_type", [
        "q1_earnings",
        "q2_earnings",
        "q3_earnings",
        "annual_earnings",
        "correction",
      ])
      .not("quarter", "is", null)
      .not("xbrl_url", "is", null)
      .gte("disclosed_at", `${from}T00:00:00+09:00`)
      .lt("disclosed_at", `${addDays(to, 1)}T00:00:00+09:00`)
      .order("disclosed_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`TDnet開示取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Disclosure[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows.filter(
    (row) =>
      row.fiscal_period_end !== null &&
      row.quarter !== null &&
      row.xbrl_url !== null &&
      !isNonEarningsNotice(row.title)
  );
}

async function loadQuarterlyRow(disclosure: Disclosure) {
  const { data, error } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select(
      "id, revenue, operating_income, ordinary_income, profit_attributable_to_owners, extraction_version, raw_financials"
    )
    .eq("company_id", disclosure.company_id)
    .eq("fiscal_period_end", disclosure.fiscal_period_end!)
    .eq("quarter", disclosure.quarter!)
    .eq("accounting_scope", disclosure.accounting_scope ?? "unknown")
    .maybeSingle();
  if (error) throw new Error(`四半期数値取得失敗 ${disclosure.ticker}: ${error.message}`);
  return data as QuarterlyRow | null;
}

function mergedValue(current: number | null, fallback: number | null, replaceFallback: boolean) {
  if (replaceFallback) return fallback ?? current;
  return current ?? fallback;
}

async function main() {
  const { from, to } = targetRange();
  const disclosures = await loadDisclosures(from, to);
  let checked = 0;
  let repaired = 0;
  const failures: string[] = [];
  const details: Array<Record<string, unknown>> = [];

  for (const disclosure of disclosures) {
    const row = await loadQuarterlyRow(disclosure);
    if (!row) continue;

    const replaceFallback = row.extraction_version === TEXT_BLOCK_VERSION;
    const needsFallback =
      replaceFallback ||
      [
        row.revenue,
        row.operating_income,
        row.ordinary_income,
        row.profit_attributable_to_owners,
      ].some((value) => value === null);
    if (!needsFallback) continue;

    checked += 1;
    try {
      const parsed = parseTdnetTextBlockFinancials(await fetchBuffer(disclosure.xbrl_url!));
      const updates = {
        revenue: mergedValue(row.revenue, parsed.revenue, replaceFallback),
        operating_income: mergedValue(
          row.operating_income,
          parsed.operatingIncome,
          replaceFallback
        ),
        ordinary_income: mergedValue(row.ordinary_income, parsed.ordinaryIncome, replaceFallback),
        profit_attributable_to_owners: mergedValue(
          row.profit_attributable_to_owners,
          parsed.profitAttributableToOwners,
          replaceFallback
        ),
      };
      const changed =
        updates.revenue !== row.revenue ||
        updates.operating_income !== row.operating_income ||
        updates.ordinary_income !== row.ordinary_income ||
        updates.profit_attributable_to_owners !== row.profit_attributable_to_owners;
      if (!changed) continue;

      const { error } = await supabaseAdmin
        .from("company_quarterly_financials")
        .update({
          ...updates,
          data_quality: [updates.revenue, updates.operating_income].some((value) => value !== null)
            ? "unreviewed"
            : "warning",
          extraction_version: TEXT_BLOCK_VERSION,
          raw_financials: {
            ...(row.raw_financials ?? {}),
            textBlockFallback: parsed,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw new Error(error.message);

      repaired += 1;
      details.push({
        ticker: disclosure.ticker,
        sourceDocumentId: disclosure.id,
        fiscalPeriodEnd: disclosure.fiscal_period_end,
        quarter: disclosure.quarter,
        ...updates,
      });
    } catch (error) {
      failures.push(
        `${disclosure.ticker}:${disclosure.id} ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  console.log("===== TDnet text-block repair =====");
  console.log(
    JSON.stringify(
      {
        range: { from, to },
        disclosures: disclosures.length,
        checked,
        repaired,
        details,
        failures,
      },
      null,
      2
    )
  );

  if (failures.length > 0) {
    throw new Error(`TDnet表形式修復で${failures.length}件失敗しました`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
