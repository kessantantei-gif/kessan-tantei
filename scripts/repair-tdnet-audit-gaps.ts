import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";

const operationStart = process.env.TDNET_OPERATION_START_DATE ?? "2026-07-25";
const maxRepairs = Math.max(1, Number(process.env.TDNET_GAP_REPAIR_MAX ?? "10"));

type Disclosure = {
  id: string;
  company_id: string;
  ticker: string;
  title: string;
  document_type: string;
  source_document_id: string;
  disclosed_at: string;
  fiscal_year: number | null;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
  accounting_standard: string | null;
};

type QuarterlyKey = {
  ticker: string;
  fiscal_period_end: string;
  quarter: number;
  accounting_scope: string;
};

type ExpiredSourceRecovery = {
  revenue: number | null;
  operatingIncome: number | null;
  ordinaryIncome: number | null;
  profitAttributableToOwners: number | null;
  operatingCF: number | null;
  investingCF: number | null;
  financingCF: number | null;
  provenance: Record<string, unknown>;
};

const EXPIRED_SOURCE_RECOVERIES: Readonly<Record<string, ExpiredSourceRecovery>> = {
  "4475|2026-06-30|3|consolidated": {
    revenue: 9390,
    operatingIncome: 1854,
    ordinaryIncome: 1857,
    profitAttributableToOwners: 1361,
    operatingCF: null,
    investingCF: null,
    financingCF: null,
    provenance: {
      reason: "TDnet historical list and XBRL archive expired before missing-row repair",
      source: "HENNGE official IR FY2026 Q3",
      sourceUrl: "https://hennge.com/jp/ir/library/",
      verificationNote:
        "FY2026 Q3 cumulative consolidated results; 2026-10-02 reviewed release states the Aug 4 quarterly financial statements were unchanged",
      unit: "JPY million",
    },
  },
  "3172|2026-07-31|4|consolidated": {
    revenue: 11141,
    operatingIncome: 311,
    ordinaryIncome: 318,
    profitAttributableToOwners: 223,
    operatingCF: 87,
    investingCF: 386,
    financingCF: -249,
    provenance: {
      reason: "TDnet historical list and XBRL archive expired before missing-row repair",
      source: "EDINET annual securities report FY2026",
      edinetDocumentId: "S100Z9MO",
      filerEdinetCode: "E26322",
      filedAt: "2026-10-23",
      unit: "JPY million",
    },
  },
};

function todayJst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isNonEarningsNotice(title: string) {
  const normalized = title.normalize("NFKC").replace(/\s+/g, "");
  return (
    /決算短信.*(?:開示|公表|発表).*(?:45日|超える|超過|延期|遅延|延長|予定|時期|変更)/.test(normalized) ||
    /(?:45日|超える|超過|延期|遅延|延長).*(?:決算短信|決算発表)/.test(normalized) ||
    /決算発表.*(?:延期|遅延|変更|予定)/.test(normalized)
  );
}

function key(row: {
  ticker: string;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
}) {
  return [row.ticker, row.fiscal_period_end, row.quarter, row.accounting_scope ?? "unknown"].join("|");
}

function jstDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date(value));
}

async function loadEarningsDisclosures(): Promise<Disclosure[]> {
  const rows: Disclosure[] = [];
  const start = `${operationStart}T00:00:00+09:00`;
  const end = `${addDays(todayJst(), 1)}T00:00:00+09:00`;

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("company_disclosures")
      .select("id,company_id,ticker,title,document_type,source_document_id,disclosed_at,fiscal_year,fiscal_period_end,quarter,accounting_scope,accounting_standard")
      .eq("source", "tdnet")
      .gte("disclosed_at", start)
      .lt("disclosed_at", end)
      .not("fiscal_period_end", "is", null)
      .not("quarter", "is", null)
      .order("disclosed_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`TDnet開示取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Disclosure[]));
    if ((data ?? []).length < 1000) break;
  }

  return rows.filter(
    (row) =>
      ["q1_earnings", "q2_earnings", "q3_earnings", "annual_earnings", "correction"].includes(
        row.document_type
      ) && !isNonEarningsNotice(row.title)
  );
}

async function existingQuarterlyKeys(tickers: string[]) {
  const found = new Set<string>();
  for (let offset = 0; offset < tickers.length; offset += 40) {
    const chunk = tickers.slice(offset, offset + 40);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("company_quarterly_financials")
        .select("ticker,fiscal_period_end,quarter,accounting_scope")
        .in("ticker", chunk)
        .range(from, from + 999);
      if (error) throw new Error(`四半期数値取得失敗: ${error.message}`);
      const page = (data ?? []) as QuarterlyKey[];
      for (const row of page) found.add(key(row));
      if (page.length < 1000) break;
    }
  }
  return found;
}

async function keyExists(value: string) {
  const [ticker, fiscalPeriodEnd, quarterRaw, accountingScope] = value.split("|");
  const { data, error } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select("id")
    .eq("ticker", ticker)
    .eq("fiscal_period_end", fiscalPeriodEnd)
    .eq("quarter", Number(quarterRaw))
    .eq("accounting_scope", accountingScope)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`修復確認失敗 ${value}: ${error.message}`);
  return Boolean(data);
}

function runRepairDate(date: string) {
  console.log(`TDnet gap repair: reprocessing ${date}`);
  return spawnSync(
    "npx",
    ["tsx", "scripts/run-tdnet-quarterly-safe-v2.ts", date],
    { stdio: "inherit", env: process.env }
  );
}

async function recoverExpiredSourceGap(value: string, disclosures: Disclosure[]) {
  const recovery = EXPIRED_SOURCE_RECOVERIES[value];
  if (!recovery) return false;

  const disclosure = disclosures
    .filter((row) => key(row) === value)
    .sort((a, b) => b.disclosed_at.localeCompare(a.disclosed_at))[0];
  if (!disclosure || !disclosure.fiscal_period_end || !disclosure.quarter) {
    throw new Error(`期限切れTDnet復旧用の開示メタデータがありません: ${value}`);
  }

  const { error } = await supabaseAdmin
    .from("company_quarterly_financials")
    .upsert(
      {
        company_id: disclosure.company_id,
        disclosure_id: disclosure.id,
        ticker: disclosure.ticker,
        fiscal_year:
          disclosure.fiscal_year ?? Number(disclosure.fiscal_period_end.slice(0, 4)),
        fiscal_period_end: disclosure.fiscal_period_end,
        quarter: disclosure.quarter,
        cumulative: true,
        accounting_scope: disclosure.accounting_scope ?? "unknown",
        accounting_standard: disclosure.accounting_standard,
        currency: "JPY",
        revenue: recovery.revenue,
        operating_income: recovery.operatingIncome,
        ordinary_income: recovery.ordinaryIncome,
        profit_attributable_to_owners: recovery.profitAttributableToOwners,
        operating_cf: recovery.operatingCF,
        investing_cf: recovery.investingCF,
        financing_cf: recovery.financingCF,
        data_quality: "reviewed",
        extraction_version: "tdnet-expired-source-recovery-v1",
        raw_financials: {
          expiredSourceRecovery: recovery.provenance,
          originalTdnetSourceDocumentId: disclosure.source_document_id,
          restoredAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,fiscal_period_end,quarter,accounting_scope" }
    );

  if (error) throw new Error(`期限切れTDnet復旧保存失敗 ${value}: ${error.message}`);
  console.log(`TDnet gap restored from verified alternate official source: ${value}`);
  return true;
}

async function main() {
  const disclosures = await loadEarningsDisclosures();
  const tickers = [...new Set(disclosures.map((row) => row.ticker))];
  const existing = await existingQuarterlyKeys(tickers);

  const datesByMissingKey = new Map<string, Set<string>>();
  for (const row of disclosures) {
    const value = key(row);
    if (existing.has(value)) continue;
    const dates = datesByMissingKey.get(value) ?? new Set<string>();
    dates.add(jstDate(row.disclosed_at));
    datesByMissingKey.set(value, dates);
  }

  const missing = [...datesByMissingKey.keys()];
  if (!missing.length) {
    console.log("TDnet gap repair: no missing quarterly rows.");
    return;
  }

  if (missing.length > maxRepairs) {
    throw new Error(
      `TDnet gap repair aborted: ${missing.length} missing keys exceeds max ${maxRepairs}`
    );
  }

  console.log("TDnet gap repair targets:", JSON.stringify(missing, null, 2));
  const unresolved: string[] = [];

  for (const value of missing) {
    const dates = [...(datesByMissingKey.get(value) ?? [])].sort();
    let repaired = false;

    for (const date of dates) {
      const result = runRepairDate(date);
      if (result.status !== 0) {
        console.warn(`TDnet gap repair command failed for ${value} on ${date}: ${result.status}`);
      }
      if (await keyExists(value)) {
        console.log(`TDnet gap repaired: ${value} via ${date}`);
        repaired = true;
        break;
      }
    }

    if (!repaired && (await recoverExpiredSourceGap(value, disclosures))) {
      repaired = await keyExists(value);
    }

    if (!repaired) unresolved.push(value);
  }

  if (unresolved.length) {
    throw new Error(`TDnet gap repair unresolved: ${unresolved.join(", ")}`);
  }

  console.log(`TDnet gap repair completed: ${missing.length} key(s) repaired.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
