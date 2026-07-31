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
      row.xbrl_url !== null
  );
}

async function loadQuarterlyRow(disclosure: Disclosure) {
  const { data, error } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select("id, operating_cf, investing_cf, financing_cf, extraction_version")
    .eq("company_id", disclosure.company_id)
    .eq("fiscal_period_end", disclosure.fiscal_period_end!)
    .eq("quarter", disclosure.quarter!)
    .eq("accounting_scope", disclosure.accounting_scope ?? "unknown")
    .maybeSingle();
  if (error) throw new Error(`四半期数値取得失敗 ${disclosure.ticker}: ${error.message}`);
  return data as QuarterlyRow | null;
}

async function main() {
  const { from, to } = targetRange();
  const disclosures = await loadDisclosures(from, to);
  const latestByKey = new Map<string, Disclosure>();
  for (const disclosure of disclosures) {
    latestByKey.set(disclosureKey(disclosure), disclosure);
  }

  const cashFlowReports: Array<Record<string, unknown>> = [];
  const problems: string[] = [];
  let cashFlowTableCount = 0;
  let matchedCount = 0;

  for (const disclosure of latestByKey.values()) {
    try {
      const parsed = parseTdnetTextBlockFinancials(await fetchBuffer(disclosure.xbrl_url!));
      if (!parsed.cashFlowTableFound) continue;
      cashFlowTableCount += 1;

      const expected = {
        operatingCF: parsed.operatingCF,
        investingCF: parsed.investingCF,
        financingCF: parsed.financingCF,
      };
      const missingParsed = Object.entries(expected)
        .filter(([, value]) => value === null)
        .map(([name]) => name);
      if (missingParsed.length > 0) {
        problems.push(
          `${disclosure.ticker}:${disclosure.id} CF表解析欠損 ${missingParsed.join(",")}`
        );
      }

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
      const mismatches = (Object.keys(expected) as Array<keyof typeof expected>).filter(
        (name) => expected[name] !== null && stored[name] !== expected[name]
      );
      if (mismatches.length > 0) {
        problems.push(
          `${disclosure.ticker}:${disclosure.id} CF保存値不一致 ${mismatches
            .map((name) => `${name}:${stored[name]}!=${expected[name]}`)
            .join(",")}`
        );
      } else if (missingParsed.length === 0) {
        matchedCount += 1;
      }

      cashFlowReports.push({
        ticker: disclosure.ticker,
        disclosureId: disclosure.id,
        title: disclosure.title,
        disclosedAt: disclosure.disclosed_at,
        fiscalPeriodEnd: disclosure.fiscal_period_end,
        quarter: disclosure.quarter,
        accountingScope: disclosure.accounting_scope,
        expected,
        stored,
        extractionVersion: row.extraction_version,
      });
    } catch (error) {
      problems.push(
        `${disclosure.ticker}:${disclosure.id} ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    range: { from, to },
    disclosures: disclosures.length,
    latestQuarterlyKeys: latestByKey.size,
    cashFlowTableCount,
    matchedCount,
    cashFlowReports,
    problems,
  };

  console.log("===== TDnet cash-flow audit =====");
  console.log(JSON.stringify(report, null, 2));

  const reportPath = process.env.TDNET_CASH_FLOW_AUDIT_REPORT_PATH;
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (problems.length > 0) {
    throw new Error(`TDnetキャッシュフロー監査で${problems.length}件の問題を検出しました`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
