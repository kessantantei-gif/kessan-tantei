import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { writeFile } from "node:fs/promises";
import { isTdnetNonEarningsDocument } from "../lib/tdnet-document-title";
import { parseTdnetTextBlockFinancials } from "../lib/tdnet-text-block-financials";
import { supabaseAdmin } from "../lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const operationStart = process.env.TDNET_OPERATION_START_DATE ?? "2026-07-25";
const userAgent = "kessan-tantei-tdnet-cash-flow-audit/1.0";

type Disclosure = {
  id: string;
  company_id: string;
  ticker: string;
  title: string;
  document_type: string;
  disclosed_at: string;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
  xbrl_url: string | null;
};

type QuarterlyRow = {
  id: string;
  operating_cf: number | null;
  investing_cf: number | null;
  financing_cf: number | null;
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
  const from = argumentValue("from") ?? operationStart;
  const to = argumentValue("to") ?? todayJst();
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw new Error(`CF監査期間が不正です: ${from} - ${to}`);
  }
  return { from, to };
}

function disclosureKey(disclosure: Disclosure) {
  return [
    disclosure.company_id,
    disclosure.fiscal_period_end,
    disclosure.quarter,
    disclosure.accounting_scope ?? "unknown",
  ].join("|");
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
        "id, company_id, ticker, title, document_type, disclosed_at, fiscal_period_end, quarter, accounting_scope, xbrl_url"
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
      .not("fiscal_period_end", "is", null)
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
      !isTdnetNonEarningsDocument(row.title, row.xbrl_url) &&
      row.fiscal_period_end !== null &&
      row.quarter !== null &&
      row.xbrl_url !== null &&
      (row.quarter === 2 || row.quarter === 4 || row.document_type === "correction")
  );
}

async function loadQuarterlyRow(disclosure: Disclosure) {
  const { data, error } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select("id, operating_cf, investing_cf, financing_cf, extraction_version, raw_financials")
    .eq("company_id", disclosure.company_id)
    .eq("fiscal_period_end", disclosure.fiscal_period_end!)
    .eq("quarter", disclosure.quarter!)
    .eq("accounting_scope", disclosure.accounting_scope ?? "unknown")
    .maybeSingle();
  if (error) throw new Error(`四半期数値取得失敗 ${disclosure.ticker}: ${error.message}`);
  return data as QuarterlyRow | null;
}

// TDnet removes old ZIP files. Do not mistake this retention policy for data
// corruption: audit the full stored history and its captured original XBRL facts,
// and independently re-download the recent disclosures while their URLs are live.
const RECENT_SOURCE_DAYS = 7;
const CASH_FLOW_FACTS = [
  [/NetCashProvidedByUsedInOperatingActivities/i, /CashFlows?FromUsedInOperatingActivities/i],
  [/NetCashProvidedByUsedInInvestingActivities/i, /CashFlows?FromUsedInInvestingActivities/i],
  [/NetCashProvidedByUsedInFinancingActivities/i, /CashFlows?FromUsedInFinancingActivities/i],
] as const;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rawCashFlowFact(raw: Record<string, unknown>, patterns: readonly RegExp[]) {
  const facts = Object.entries(raw)
    .filter(([key, value]) =>
      patterns.some((pattern) => pattern.test(key.split(":")[0])) && finiteNumber(value) !== null
    );
  const current = facts.filter(([key]) =>
    /Current.*(?:YTD|Duration|Instant)|CurrentYear|CurrentQuarter/i.test(key)
  );
  return finiteNumber((current[0] ?? facts[0])?.[1]);
}

function storedEvidence(row: QuarterlyRow) {
  const raw = row.raw_financials;
  if (!raw || typeof raw !== "object") return null;
  const fallback = raw.textBlockFallback;
  if (fallback && typeof fallback === "object") {
    const parsed = fallback as Record<string, unknown>;
    if (parsed.cashFlowTableFound === true) {
      return {
        operatingCF: finiteNumber(parsed.operatingCF),
        investingCF: finiteNumber(parsed.investingCF),
        financingCF: finiteNumber(parsed.financingCF),
      };
    }
  }
  const values = CASH_FLOW_FACTS.map((patterns) => rawCashFlowFact(raw, patterns));
  if (values.every((value) => value === null)) return null;
  return { operatingCF: values[0], investingCF: values[1], financingCF: values[2] };
}

function cashFlowDiffs(
  stored: { operatingCF: number | null; investingCF: number | null; financingCF: number | null },
  expected: { operatingCF: number | null; investingCF: number | null; financingCF: number | null }
) {
  return (Object.keys(expected) as Array<keyof typeof expected>)
    .filter((field) => expected[field] !== null && stored[field] !== expected[field])
    .map((field) => `${field}:${String(stored[field])}!=${String(expected[field])}`);
}

async function main() {
  const { from, to } = targetRange();
  const disclosures = await loadDisclosures(from, to);
  const latestByKey = new Map<string, Disclosure>();
  for (const disclosure of disclosures) latestByKey.set(disclosureKey(disclosure), disclosure);

  const freshCutoff = addDays(todayJst(), -RECENT_SOURCE_DAYS);
  const problems: string[] = [];
  const matchedEvidence: Array<Record<string, unknown>> = [];
  let historicalStoredRows = 0;
  let archivedWithoutRawCashFlowEvidence = 0;
  let archivedRawFactsVerified = 0;
  let freshSourceChecked = 0;
  let freshCashFlowTables = 0;
  let freshSourceMatches = 0;

  for (const disclosure of latestByKey.values()) {
    // The immutable quarterly key is mandatory even when TDnet's old ZIP expired.
    const row = await loadQuarterlyRow(disclosure);
    if (!row) {
      problems.push(`${disclosure.ticker}:${disclosure.id} 四半期数値行なし`);
      continue;
    }
    const stored = {
      operatingCF: row.operating_cf,
      investingCF: row.investing_cf,
      financingCF: row.financing_cf,
    };
    historicalStoredRows += 1;

    const evidence = storedEvidence(row);
    if (evidence) {
      const diffs = cashFlowDiffs(stored, evidence);
      if (diffs.length > 0) {
        problems.push(`${disclosure.ticker}:${disclosure.id} 保存済みXBRLのCF値と不一致 ${diffs.join(",")}`);
      } else {
        archivedRawFactsVerified += 1;
      }
    } else if (disclosure.disclosed_at.slice(0, 10) < freshCutoff) {
      // Historic documents may not have original cash-flow facts saved.
      // Explicitly count these as NOT independently source-reverified.
      archivedWithoutRawCashFlowEvidence += 1;
    }

    if (disclosure.disclosed_at.slice(0, 10) < freshCutoff) continue;

    try {
      const parsed = parseTdnetTextBlockFinancials(await fetchBuffer(disclosure.xbrl_url!));
      freshSourceChecked += 1;
      if (!parsed.cashFlowTableFound) continue;
      freshCashFlowTables += 1;
      const expected = {
        operatingCF: parsed.operatingCF,
        investingCF: parsed.investingCF,
        financingCF: parsed.financingCF,
      };
      const missing = Object.entries(expected).filter(([, value]) => value === null).map(([name]) => name);
      if (missing.length > 0) problems.push(`${disclosure.ticker}:${disclosure.id} CF表解析欠損 ${missing.join(",")}`);
      const diffs = cashFlowDiffs(stored, expected);
      if (diffs.length > 0) problems.push(`${disclosure.ticker}:${disclosure.id} CF保存値不一致 ${diffs.join(",")}`);
      if (!missing.length && !diffs.length) freshSourceMatches += 1;
      matchedEvidence.push({ ticker: disclosure.ticker, disclosureId: disclosure.id, expected, stored });
    } catch (error) {
      problems.push(`${disclosure.ticker}:${disclosure.id} 最近のTDnet ZIP取得または解析失敗 ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    range: { from, to },
    freshCutoff,
    disclosures: disclosures.length,
    latestQuarterlyKeys: latestByKey.size,
    historicalStoredRows,
    archivedRawFactsVerified,
    archivedWithoutRawCashFlowEvidence,
    freshSourceChecked,
    freshCashFlowTables,
    freshSourceMatches,
    matchedEvidence,
    problems,
    historicalSourceLimitation:
      "Archived ZIPs are no longer provided by TDnet. Missing raw facts are disclosed but cannot be independently source-reverified; archived normalized row existence remains mandatory.",
  };
  console.log("===== TDnet cash-flow audit: stored history + fresh source =====");
  console.log(JSON.stringify({ ...report, matchedEvidence: matchedEvidence.slice(0, 10) }, null, 2));
  const reportPath = process.env.TDNET_CASH_FLOW_AUDIT_REPORT_PATH;
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (problems.length > 0) throw new Error(`TDnetキャッシュフロー監査で${problems.length}件の問題を検出しました`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
