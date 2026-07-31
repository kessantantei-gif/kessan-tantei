import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

const TARGET_DATE = "2026-07-30";
const JST_START = "2026-07-29T15:00:00.000Z";
const JST_END = "2026-07-30T15:00:00.000Z";
const TDNET_LIST_TEMPLATE =
  "https://www.release.tdnet.info/inbs/I_list_001_{yyyymmdd}.html";
const USER_AGENT = "kessan-tantei-tdnet-audit/1.0";

type DocumentType =
  | "q1_earnings"
  | "q2_earnings"
  | "q3_earnings"
  | "annual_earnings"
  | "forecast_revision"
  | "dividend_revision"
  | "correction"
  | "other";

type Candidate = {
  sourceDocumentId: string;
  ticker: string;
  title: string;
  documentType: DocumentType;
  quarter: 1 | 2 | 3 | 4 | null;
};

type Disclosure = {
  id: string;
  company_id: string;
  ticker: string;
  title: string;
  document_type: DocumentType;
  disclosed_at: string;
  fiscal_year: number | null;
  fiscal_period_end: string | null;
  quarter: number | null;
  accounting_scope: string | null;
  source_document_id: string;
  raw_payload: unknown;
};

type QuarterlyRow = {
  id: string;
  company_id: string;
  disclosure_id: string;
  ticker: string;
  fiscal_year: number;
  fiscal_period_end: string;
  quarter: number;
  accounting_scope: string;
  revenue: number | null;
  operating_income: number | null;
  ordinary_income: number | null;
  profit_attributable_to_owners: number | null;
  operating_cf: number | null;
  data_quality: string | null;
};

function cleanText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(base: string, href: string) {
  return new URL(href.replace(/&amp;/g, "&"), base).toString();
}

function normalizeTicker(value: string) {
  const match = value.normalize("NFKC").match(/(?:^|\D)([0-9A-Z]{4})(?:0)?(?:\D|$)/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function classifyTitle(title: string): Pick<Candidate, "documentType" | "quarter"> {
  const normalized = title.normalize("NFKC");
  const isCorrection = /訂正|修正/.test(normalized);

  if (/配当予想/.test(normalized)) {
    return { documentType: "dividend_revision", quarter: null };
  }
  if (/業績予想/.test(normalized) && /修正/.test(normalized)) {
    return { documentType: "forecast_revision", quarter: null };
  }
  if (!/決算短信/.test(normalized)) {
    return { documentType: "other", quarter: null };
  }
  if (/第1四半期|第１四半期|1Q|１Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q1_earnings", quarter: 1 };
  }
  if (/第2四半期|第２四半期|中間期|中間決算|2Q|２Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q2_earnings", quarter: 2 };
  }
  if (/第3四半期|第３四半期|3Q|３Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q3_earnings", quarter: 3 };
  }
  return { documentType: isCorrection ? "correction" : "annual_earnings", quarter: 4 };
}

function parseCandidates(html: string, sourceUrl: string): Candidate[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const candidates: Candidate[] = [];

  for (const row of rows) {
    const text = cleanText(row);
    const classification = classifyTitle(text);
    if (classification.documentType === "other") continue;

    const ticker = normalizeTicker(text);
    if (!ticker) continue;

    const anchors = [...row.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(
      (match) => ({ href: absoluteUrl(sourceUrl, match[1]), text: cleanText(match[2]) })
    );
    const pdf = anchors.find((anchor) => /\.pdf(?:\?|$)/i.test(anchor.href));
    const xbrl = anchors.find((anchor) => /\.zip(?:\?|$)|xbrl/i.test(anchor.href));
    if (!pdf && !xbrl) continue;

    const title =
      anchors
        .map((anchor) => anchor.text)
        .find((anchorText) => /決算短信|業績予想|配当予想/.test(anchorText)) ?? text;
    const sourceDocumentId =
      (pdf?.href ?? xbrl?.href ?? "").match(/([0-9]{16,})/)?.[1] ??
      Buffer.from(`${ticker}:${TARGET_DATE}:${title}`).toString("base64url").slice(0, 48);

    candidates.push({
      sourceDocumentId,
      ticker,
      title,
      ...classification,
    });
  }

  return [...new Map(candidates.map((candidate) => [candidate.sourceDocumentId, candidate])).values()];
}

function tdnetListUrl(page: number) {
  const pageText = String(page).padStart(3, "0");
  return TDNET_LIST_TEMPLATE.replace("{yyyymmdd}", TARGET_DATE.replace(/-/g, "")).replace(
    /I_list_\d{3}_/,
    `I_list_${pageText}_`
  );
}

async function loadTdnetCandidates() {
  const candidates: Candidate[] = [];
  const failures: string[] = [];

  for (let page = 1; page <= 50; page += 1) {
    const url = tdnetListUrl(page);
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) {
      if (page === 1 || response.status !== 404) failures.push(`${url}: ${response.status}`);
      break;
    }
    candidates.push(...parseCandidates(await response.text(), url));
  }

  return {
    candidates: [...new Map(candidates.map((candidate) => [candidate.sourceDocumentId, candidate])).values()],
    failures,
  };
}

async function loadListedTickers() {
  const tickers = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("ticker")
      .eq("listing_status", "listed")
      .range(from, from + 999);
    if (error) throw new Error(`会社マスタ取得失敗: ${error.message}`);
    for (const row of data ?? []) tickers.add(String(row.ticker));
    if ((data ?? []).length < 1000) break;
  }
  return tickers;
}

async function loadDisclosures() {
  const { data, error } = await supabaseAdmin
    .from("company_disclosures")
    .select(
      "id, company_id, ticker, title, document_type, disclosed_at, fiscal_year, fiscal_period_end, quarter, accounting_scope, source_document_id, raw_payload"
    )
    .eq("source", "tdnet")
    .gte("disclosed_at", JST_START)
    .lt("disclosed_at", JST_END)
    .order("ticker", { ascending: true });
  if (error) throw new Error(`開示取得失敗: ${error.message}`);
  return (data ?? []) as Disclosure[];
}

async function loadQuarterlyRows(tickers: string[]) {
  const rows: QuarterlyRow[] = [];
  for (let offset = 0; offset < tickers.length; offset += 40) {
    const tickerChunk = tickers.slice(offset, offset + 40);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("company_quarterly_financials")
        .select(
          "id, company_id, disclosure_id, ticker, fiscal_year, fiscal_period_end, quarter, accounting_scope, revenue, operating_income, ordinary_income, profit_attributable_to_owners, operating_cf, data_quality"
        )
        .in("ticker", tickerChunk)
        .range(from, from + 999);
      if (error) throw new Error(`四半期数値取得失敗: ${error.message}`);
      rows.push(...((data ?? []) as QuarterlyRow[]));
      if ((data ?? []).length < 1000) break;
    }
  }
  return rows;
}

function disclosureKey(disclosure: Disclosure) {
  return [
    disclosure.ticker,
    disclosure.fiscal_period_end,
    disclosure.quarter,
    disclosure.accounting_scope ?? "unknown",
  ].join("|");
}

function quarterlyKey(row: QuarterlyRow) {
  return [row.ticker, row.fiscal_period_end, row.quarter, row.accounting_scope ?? "unknown"].join("|");
}

function extractionError(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const value = (rawPayload as Record<string, unknown>).extractionError;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function countBy<T>(items: T[], selector: (item: T) => string) {
  return Object.fromEntries(
    [...items.reduce((map, item) => {
      const key = selector(item);
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())].sort(([left], [right]) => left.localeCompare(right))
  );
}

async function main() {
  const [{ candidates, failures: listFailures }, listedTickers, disclosures] = await Promise.all([
    loadTdnetCandidates(),
    loadListedTickers(),
    loadDisclosures(),
  ]);

  const registeredCandidates = candidates.filter((candidate) => listedTickers.has(candidate.ticker));
  const unknownCandidates = candidates.filter((candidate) => !listedTickers.has(candidate.ticker));
  const disclosureDocumentIds = new Set(disclosures.map((row) => row.source_document_id));
  const missingRegisteredCandidates = registeredCandidates.filter(
    (candidate) => !disclosureDocumentIds.has(candidate.sourceDocumentId)
  );

  const targetTickers = [...new Set(disclosures.map((row) => row.ticker))];
  const quarterlyRows = await loadQuarterlyRows(targetTickers);
  const quarterlyByKey = new Map(quarterlyRows.map((row) => [quarterlyKey(row), row]));

  const quarterDisclosures = disclosures.filter((row) => row.quarter !== null);
  const uniqueRequiredKeys = new Set(quarterDisclosures.map(disclosureKey));
  const missingQuarterlyKeys = [...uniqueRequiredKeys].filter((key) => !quarterlyByKey.has(key));
  const matchedQuarterlyRows = [...uniqueRequiredKeys]
    .map((key) => quarterlyByKey.get(key))
    .filter((row): row is QuarterlyRow => Boolean(row));
  const extractionErrors = disclosures
    .map((row) => ({ ticker: row.ticker, title: row.title, error: extractionError(row.raw_payload) }))
    .filter((row) => row.error !== null);
  const allCoreMetricsNull = matchedQuarterlyRows.filter(
    (row) =>
      row.revenue === null &&
      row.operating_income === null &&
      row.ordinary_income === null &&
      row.profit_attributable_to_owners === null
  );

  const nonFujitsuDisclosures = disclosures.filter((row) => row.ticker !== "6702");
  const nonFujitsuRequiredKeys = new Set(
    quarterDisclosures.filter((row) => row.ticker !== "6702").map(disclosureKey)
  );
  const nonFujitsuMatched = [...nonFujitsuRequiredKeys].filter((key) => quarterlyByKey.has(key));

  const report = {
    targetDate: TARGET_DATE,
    tdnet: {
      candidates: candidates.length,
      registeredCandidates: registeredCandidates.length,
      unknownCandidates: unknownCandidates.map((row) => ({
        ticker: row.ticker,
        documentType: row.documentType,
        title: row.title,
      })),
      listFailures,
      byDocumentType: countBy(candidates, (row) => row.documentType),
    },
    database: {
      disclosures: disclosures.length,
      uniqueTickers: targetTickers.length,
      byDocumentType: countBy(disclosures, (row) => row.document_type),
      extractionErrors,
      missingRegisteredCandidates: missingRegisteredCandidates.map((row) => ({
        ticker: row.ticker,
        documentType: row.documentType,
        title: row.title,
      })),
      quarterDisclosures: quarterDisclosures.length,
      uniqueQuarterlyKeysRequired: uniqueRequiredKeys.size,
      matchedQuarterlyKeys: matchedQuarterlyRows.length,
      missingQuarterlyKeys,
      allCoreMetricsNull: allCoreMetricsNull.map((row) => ({
        ticker: row.ticker,
        fiscalPeriodEnd: row.fiscal_period_end,
        quarter: row.quarter,
        dataQuality: row.data_quality,
      })),
      metricAvailability: {
        revenue: matchedQuarterlyRows.filter((row) => row.revenue !== null).length,
        operatingIncome: matchedQuarterlyRows.filter((row) => row.operating_income !== null).length,
        ordinaryIncome: matchedQuarterlyRows.filter((row) => row.ordinary_income !== null).length,
        profitAttributableToOwners: matchedQuarterlyRows.filter(
          (row) => row.profit_attributable_to_owners !== null
        ).length,
        operatingCF: matchedQuarterlyRows.filter((row) => row.operating_cf !== null).length,
      },
    },
    excludingFujitsu: {
      disclosures: nonFujitsuDisclosures.length,
      uniqueTickers: new Set(nonFujitsuDisclosures.map((row) => row.ticker)).size,
      uniqueQuarterlyKeysRequired: nonFujitsuRequiredKeys.size,
      matchedQuarterlyKeys: nonFujitsuMatched.length,
      byDocumentType: countBy(nonFujitsuDisclosures, (row) => row.document_type),
    },
  };

  console.log("===== TDnet 2026-07-30 ALL-COMPANY AUDIT =====");
  console.log(JSON.stringify(report, null, 2));

  const fatalProblems = [
    ...listFailures,
    ...extractionErrors.map((row) => `${row.ticker}: ${row.error}`),
    ...missingRegisteredCandidates.map((row) => `${row.ticker}: 開示未保存`),
    ...missingQuarterlyKeys.map((key) => `${key}: 四半期数値未保存`),
  ];
  if (fatalProblems.length > 0) {
    throw new Error(`TDnet全件監査で${fatalProblems.length}件の問題を検出しました`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
