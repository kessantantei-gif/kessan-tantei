import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { isTdnetNonEarningsDocument } from "../lib/tdnet-document-title";
import { supabaseAdmin } from "../lib/supabase";

const operationStart = process.env.TDNET_OPERATION_START_DATE ?? "2026-07-25";
const maxRepairs = Math.max(1, Number(process.env.TDNET_GAP_REPAIR_MAX ?? "10"));

type Disclosure = {
  id: string;
  company_id: string;
  ticker: string;
  title: string;
  document_type: string;
  disclosed_at: string;
  fiscal_year: number | null;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
  accounting_standard: string | null;
  currency: string | null;
  xbrl_url: string | null;
};

type QuarterlyKey = {
  ticker: string;
  fiscal_period_end: string;
  quarter: number;
  accounting_scope: string;
};

type AnnualPeriodRow = {
  fiscal_year: number | null;
  period_end: string | null;
  document_id: string | null;
  financials: Record<string, unknown> | null;
};

type KnownOfficialRepair = {
  fiscalYear: number;
  revenue: number | null;
  operatingIncome: number | null;
  ordinaryIncome: number | null;
  profitAttributableToOwners: number | null;
  operatingCF: number | null;
  investingCF: number | null;
  financingCF: number | null;
  totalAssets: number | null;
  netAssets: number | null;
  equity: number | null;
  sourceUrl: string;
  note: string;
};

// Historical TDnet ZIP files can expire. Keep only verified, immutable values
// that cannot be reconstructed from the normalized EDINET annual table.
// HENNGE FY2026 Q3 is published in the issuer's official IR library; the
// October corrected release retained these Q3 result values.
const KNOWN_OFFICIAL_REPAIRS: Record<string, KnownOfficialRepair> = {
  "4475|2026-06-30|3|consolidated": {
    fiscalYear: 2026,
    revenue: 9_390_000_000,
    operatingIncome: 1_854_000_000,
    ordinaryIncome: 1_857_000_000,
    profitAttributableToOwners: 1_361_000_000,
    operatingCF: null,
    investingCF: null,
    financingCF: null,
    totalAssets: 12_146_000_000,
    netAssets: 4_114_000_000,
    equity: 4_069_000_000,
    sourceUrl: "https://hennge.com/jp/ir/library/",
    note: "HENNGE FY2026 Q3 official issuer IR",
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

function key(row: {
  ticker: string;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
}) {
  return [row.ticker, row.fiscal_period_end, row.quarter, row.accounting_scope ?? "unknown"].join("|");
}

function parseKey(value: string) {
  const [ticker, fiscalPeriodEnd, quarterRaw, accountingScope] = value.split("|");
  const quarter = Number(quarterRaw);
  if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(fiscalPeriodEnd) || !Number.isInteger(quarter)) {
    throw new Error(`TDnet gap key is invalid: ${value}`);
  }
  return { ticker, fiscalPeriodEnd, quarter, accountingScope: accountingScope || "unknown" };
}

function jstDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date(value));
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function loadEarningsDisclosures(): Promise<Disclosure[]> {
  const rows: Disclosure[] = [];
  const start = `${operationStart}T00:00:00+09:00`;
  const end = `${addDays(todayJst(), 1)}T00:00:00+09:00`;

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("company_disclosures")
      .select(
        "id,company_id,ticker,title,document_type,disclosed_at,fiscal_year,fiscal_period_end,quarter,accounting_scope,accounting_standard,currency,xbrl_url"
      )
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
      ) && !isTdnetNonEarningsDocument(row.title, row.xbrl_url)
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
  const { ticker, fiscalPeriodEnd, quarter, accountingScope } = parseKey(value);
  const { data, error } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select("id")
    .eq("ticker", ticker)
    .eq("fiscal_period_end", fiscalPeriodEnd)
    .eq("quarter", quarter)
    .eq("accounting_scope", accountingScope)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`修復確認失敗 ${value}: ${error.message}`);
  return Boolean(data);
}

async function targetDisclosure(value: string): Promise<Disclosure | null> {
  const { ticker, fiscalPeriodEnd, quarter, accountingScope } = parseKey(value);
  const { data, error } = await supabaseAdmin
    .from("company_disclosures")
    .select(
      "id,company_id,ticker,title,document_type,disclosed_at,fiscal_year,fiscal_period_end,quarter,accounting_scope,accounting_standard,currency,xbrl_url"
    )
    .eq("source", "tdnet")
    .eq("ticker", ticker)
    .eq("fiscal_period_end", fiscalPeriodEnd)
    .eq("quarter", quarter)
    .eq("accounting_scope", accountingScope)
    .order("disclosed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`対象TDnet開示取得失敗 ${value}: ${error.message}`);
  return (data as Disclosure | null) ?? null;
}

async function repairScopeAlias(value: string) {
  const { ticker, fiscalPeriodEnd, quarter, accountingScope } = parseKey(value);
  const { data, error } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select("id,accounting_scope")
    .eq("ticker", ticker)
    .eq("fiscal_period_end", fiscalPeriodEnd)
    .eq("quarter", quarter)
    .neq("accounting_scope", accountingScope)
    .limit(3);
  if (error) throw new Error(`scope候補取得失敗 ${value}: ${error.message}`);
  const rows = data ?? [];
  if (rows.length !== 1) return false;

  const { error: updateError } = await supabaseAdmin
    .from("company_quarterly_financials")
    .update({ accounting_scope: accountingScope, updated_at: new Date().toISOString() })
    .eq("id", rows[0].id);
  if (updateError) throw new Error(`scope補正失敗 ${value}: ${updateError.message}`);

  console.log(
    `TDnet gap repaired by scope normalization: ${value} from ${String(rows[0].accounting_scope)}`
  );
  return true;
}

async function repairQ4FromAnnualEdinet(value: string) {
  const parsedKey = parseKey(value);
  if (parsedKey.quarter !== 4) return false;

  const disclosure = await targetDisclosure(value);
  if (!disclosure) return false;

  const { data, error } = await supabaseAdmin
    .from("company_financial_periods")
    .select("fiscal_year,period_end,document_id,financials")
    .eq("company_id", disclosure.company_id)
    .eq("period_end", parsedKey.fiscalPeriodEnd)
    .eq("period_type", "annual")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`EDINET年次補完取得失敗 ${value}: ${error.message}`);

  const annual = (data as AnnualPeriodRow | null) ?? null;
  const financials = annual?.financials ?? null;
  if (!annual || !financials) return false;

  const revenue = finite(financials.revenue);
  const operatingIncome = finite(financials.operatingIncome);
  const netIncome = finite(financials.netIncome);
  if ([revenue, operatingIncome, netIncome].every((item) => item === null)) return false;

  const { error: upsertError } = await supabaseAdmin
    .from("company_quarterly_financials")
    .upsert(
      {
        company_id: disclosure.company_id,
        disclosure_id: disclosure.id,
        ticker: parsedKey.ticker,
        fiscal_year:
          disclosure.fiscal_year ??
          annual.fiscal_year ??
          Number(parsedKey.fiscalPeriodEnd.slice(0, 4)),
        fiscal_period_end: parsedKey.fiscalPeriodEnd,
        quarter: 4,
        cumulative: true,
        accounting_scope: parsedKey.accountingScope,
        accounting_standard: disclosure.accounting_standard,
        currency: disclosure.currency ?? "JPY",
        revenue,
        operating_income: operatingIncome,
        ordinary_income: finite(financials.ordinaryIncome),
        profit_attributable_to_owners: netIncome,
        operating_cf: finite(financials.operatingCF),
        investing_cf: finite(financials.investingCF),
        financing_cf: finite(financials.financingCF),
        total_assets: finite(financials.assets),
        net_assets: finite(financials.netAssets),
        equity: finite(financials.equity ?? financials.equityAmount),
        data_quality: "unreviewed",
        extraction_version: "tdnet-gap-from-edinet-annual-v1",
        raw_financials: {
          repairSource: "normalized-edinet-annual",
          edinetDocumentId: annual.document_id,
          annualFinancials: financials,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,fiscal_period_end,quarter,accounting_scope" }
    );
  if (upsertError) throw new Error(`EDINET年次補完保存失敗 ${value}: ${upsertError.message}`);

  console.log(
    `TDnet Q4 gap repaired from normalized EDINET annual data: ${value} via ${annual.document_id ?? "unknown"}`
  );
  return true;
}

async function repairKnownOfficialGap(value: string) {
  const repair = KNOWN_OFFICIAL_REPAIRS[value];
  if (!repair) return false;

  const disclosure = await targetDisclosure(value);
  if (!disclosure) return false;
  const parsedKey = parseKey(value);

  const { error } = await supabaseAdmin
    .from("company_quarterly_financials")
    .upsert(
      {
        company_id: disclosure.company_id,
        disclosure_id: disclosure.id,
        ticker: parsedKey.ticker,
        fiscal_year: repair.fiscalYear,
        fiscal_period_end: parsedKey.fiscalPeriodEnd,
        quarter: parsedKey.quarter,
        cumulative: true,
        accounting_scope: parsedKey.accountingScope,
        accounting_standard: disclosure.accounting_standard,
        currency: disclosure.currency ?? "JPY",
        revenue: repair.revenue,
        operating_income: repair.operatingIncome,
        ordinary_income: repair.ordinaryIncome,
        profit_attributable_to_owners: repair.profitAttributableToOwners,
        operating_cf: repair.operatingCF,
        investing_cf: repair.investingCF,
        financing_cf: repair.financingCF,
        total_assets: repair.totalAssets,
        net_assets: repair.netAssets,
        equity: repair.equity,
        data_quality: "reviewed",
        extraction_version: "tdnet-official-ir-gap-repair-v1",
        raw_financials: {
          repairSource: "issuer-official-ir",
          sourceUrl: repair.sourceUrl,
          note: repair.note,
          repairedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,fiscal_period_end,quarter,accounting_scope" }
    );
  if (error) throw new Error(`公式IR補完保存失敗 ${value}: ${error.message}`);

  console.log(`TDnet gap repaired from issuer official IR: ${value} ${repair.sourceUrl}`);
  return true;
}

function runStoredDisclosureRepair(date: string) {
  console.log(`TDnet gap repair: rebuilding from stored disclosure ${date}`);
  return spawnSync(
    "npx",
    ["tsx", "scripts/repair-tdnet-text-block-financials.ts", date],
    { stdio: "inherit", env: process.env }
  );
}

function runRepairDate(date: string) {
  console.log(`TDnet gap repair: reprocessing live/archive list ${date}`);
  return spawnSync(
    "npx",
    ["tsx", "scripts/run-tdnet-quarterly-safe-v2.ts", date],
    { stdio: "inherit", env: process.env }
  );
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
    let repaired = false;

    if (await repairScopeAlias(value)) repaired = await keyExists(value);
    if (!repaired && (await repairQ4FromAnnualEdinet(value))) repaired = await keyExists(value);
    if (!repaired && (await repairKnownOfficialGap(value))) repaired = await keyExists(value);

    if (repaired) continue;

    const dates = [...(datesByMissingKey.get(value) ?? [])].sort();
    for (const date of dates) {
      const storedResult = runStoredDisclosureRepair(date);
      if (storedResult.status !== 0) {
        console.warn(
          `TDnet stored-disclosure repair failed for ${value} on ${date}: ${storedResult.status}`
        );
      }
      if (await keyExists(value)) {
        console.log(`TDnet gap repaired from stored disclosure: ${value} via ${date}`);
        repaired = true;
        break;
      }

      const result = runRepairDate(date);
      if (result.status !== 0) {
        console.warn(`TDnet gap live-list repair failed for ${value} on ${date}: ${result.status}`);
      }
      if (await keyExists(value)) {
        console.log(`TDnet gap repaired from live list: ${value} via ${date}`);
        repaired = true;
        break;
      }
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
