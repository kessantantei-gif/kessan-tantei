import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "../lib/supabase";

const DEFAULT_LIST_TEMPLATE =
  "https://www.release.tdnet.info/inbs/I_list_001_{yyyymmdd}.html";
const listTemplate = process.env.TDNET_LIST_URL_TEMPLATE || DEFAULT_LIST_TEMPLATE;
const userAgent = "kessan-tantei-quarterly-ingestion/1.0";

type Company = {
  id: string;
  ticker: string;
  company_name: string;
};

type DisclosureCandidate = {
  sourceDocumentId: string;
  ticker: string;
  companyName: string;
  title: string;
  disclosedAt: string;
  sourceUrl: string;
  xbrlUrl: string | null;
  pdfUrl: string | null;
  documentType:
    | "q1_earnings"
    | "q2_earnings"
    | "q3_earnings"
    | "annual_earnings"
    | "forecast_revision"
    | "dividend_revision"
    | "correction"
    | "other";
  quarter: 1 | 2 | 3 | 4 | null;
  isCorrection: boolean;
};

type ParsedFinancials = {
  fiscalYear: number;
  fiscalPeriodEnd: string;
  quarter: 1 | 2 | 3 | 4;
  accountingScope: "consolidated" | "non_consolidated" | "unknown";
  accountingStandard: string | null;
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
  earningsForecastRevenue: number | null;
  earningsForecastOperatingIncome: number | null;
  earningsForecastOrdinaryIncome: number | null;
  earningsForecastProfit: number | null;
  rawFinancials: Record<string, unknown>;
};

type Fact = {
  name: string;
  value: string;
  contextRef: string | null;
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

function classifyTitle(title: string): Pick<DisclosureCandidate, "documentType" | "quarter" | "isCorrection"> {
  const normalized = title.normalize("NFKC");
  const isCorrection = /訂正|修正/.test(normalized);

  if (/配当予想/.test(normalized)) {
    return { documentType: "dividend_revision", quarter: null, isCorrection };
  }
  if (/業績予想/.test(normalized) && /修正/.test(normalized)) {
    return { documentType: "forecast_revision", quarter: null, isCorrection };
  }
  if (!/決算短信/.test(normalized)) {
    return { documentType: "other", quarter: null, isCorrection };
  }

  if (/第1四半期|第１四半期|1Q|１Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q1_earnings", quarter: 1, isCorrection };
  }
  if (/第2四半期|第２四半期|中間期|中間決算|2Q|２Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q2_earnings", quarter: 2, isCorrection };
  }
  if (/第3四半期|第３四半期|3Q|３Q/i.test(normalized)) {
    return { documentType: isCorrection ? "correction" : "q3_earnings", quarter: 3, isCorrection };
  }
  return { documentType: isCorrection ? "correction" : "annual_earnings", quarter: 4, isCorrection };
}

function parseCandidates(html: string, sourceUrl: string, date: string): DisclosureCandidate[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const candidates: DisclosureCandidate[] = [];

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

    const title = anchors
      .map((anchor) => anchor.text)
      .find((anchorText) => /決算短信|業績予想|配当予想/.test(anchorText)) || text;
    const sourceDocumentId =
      (pdf?.href ?? xbrl?.href ?? "").match(/([0-9]{16,})/)?.[1] ??
      Buffer.from(`${ticker}:${date}:${title}`).toString("base64url").slice(0, 48);
    const time = text.match(/(?:^|\s)([0-2]\d:[0-5]\d)(?:\s|$)/)?.[1] ?? "15:00";

    candidates.push({
      sourceDocumentId,
      ticker,
      companyName: text.replace(title, "").replace(ticker, "").trim() || ticker,
      title,
      disclosedAt: `${date}T${time}:00+09:00`,
      sourceUrl,
      xbrlUrl: xbrl?.href ?? null,
      pdfUrl: pdf?.href ?? null,
      ...classification,
    });
  }

  return [...new Map(candidates.map((candidate) => [candidate.sourceDocumentId, candidate])).values()];
}

function localName(name: string) {
  return name.includes(":") ? name.split(":").at(-1)! : name;
}

function collectFacts(node: unknown, facts: Fact[], inheritedName = "") {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") {
    if (inheritedName && String(node).trim()) {
      facts.push({ name: localName(inheritedName), value: String(node).trim(), contextRef: null });
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectFacts(item, facts, inheritedName);
    return;
  }

  const record = node as Record<string, unknown>;
  if ("#text" in record && inheritedName) {
    facts.push({
      name: localName(inheritedName),
      value: String(record["#text"] ?? "").trim(),
      contextRef: typeof record["@_contextRef"] === "string" ? record["@_contextRef"] : null,
    });
  }

  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@_") || key === "#text") continue;
    collectFacts(value, facts, key);
  }
}

function parseNumeric(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-" || normalized === "—") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function findFact(facts: Fact[], names: RegExp[], preferredContexts: RegExp[] = []) {
  const candidates = facts.filter((fact) => names.some((pattern) => pattern.test(fact.name)));
  const preferred = candidates.find((fact) =>
    preferredContexts.some((pattern) => pattern.test(fact.contextRef ?? ""))
  );
  return parseNumeric((preferred ?? candidates[0])?.value ?? "");
}

function findText(facts: Fact[], names: RegExp[]) {
  return facts.find((fact) => names.some((pattern) => pattern.test(fact.name)))?.value ?? null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/(20\d{2})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function latestContextPeriodEnd(xml: string, disclosedAt: string) {
  const cutoff = disclosedAt.slice(0, 10);
  const dates = [
    ...xml.matchAll(
      /<(?:[A-Za-z_][\w.-]*:)?(?:endDate|instant)\b[^>]*>\s*(20\d{2}-\d{2}-\d{2})\s*<\//gi
    ),
  ]
    .map((match) => match[1])
    .filter((date) => date <= cutoff)
    .sort();
  return dates.at(-1) ?? null;
}

function parseXbrl(
  buffer: Buffer,
  quarter: 1 | 2 | 3 | 4,
  disclosedAt: string
): ParsedFinancials {
  const zip = new AdmZip(buffer);
  const instance = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .find((entry) => /(?:\.xbrl|\.xml)$/i.test(entry.entryName) && !/taxonomy|label|presentation|definition|calculation/i.test(entry.entryName));
  if (!instance) throw new Error("XBRLインスタンスがZIP内にありません");

  const xml = instance.getData().toString("utf8");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
  const parsed = parser.parse(xml);
  const facts: Fact[] = [];
  collectFacts(parsed, facts);

  const currentContexts = [/Current.*(?:YTD|Duration|Instant)/i, /CurrentYear/i, /CurrentQuarter/i];
  const fiscalYearEnd = parseDate(
    findText(facts, [/CurrentFiscalYearEndDate/i, /FiscalYearEndDate/i])
  );
  const fiscalPeriodEnd =
    parseDate(
      findText(facts, [
        /CurrentQuarterEndDate/i,
        /CurrentPeriodEndDate/i,
        /InterimPeriodEndDate/i,
        /Quarterly.*PeriodEndDate/i,
      ])
    ) ?? latestContextPeriodEnd(xml, disclosedAt);
  if (!fiscalPeriodEnd) throw new Error("決算期末日をXBRLから取得できません");

  const accountingStandard = findText(facts, [/AccountingStandards/i, /AccountingStandard/i]);
  const consolidated = findText(facts, [/WhetherConsolidatedFinancialStatementsArePrepared/i]);
  const accountingScope =
    consolidated === "true" || consolidated === "1"
      ? "consolidated"
      : consolidated === "false" || consolidated === "0"
        ? "non_consolidated"
        : "unknown";

  const rawFinancials = Object.fromEntries(
    facts
      .filter((fact) => parseNumeric(fact.value) !== null)
      .slice(0, 500)
      .map((fact) => [`${fact.name}:${fact.contextRef ?? ""}`, fact.value])
  );

  return {
    fiscalYear: Number((fiscalYearEnd ?? fiscalPeriodEnd).slice(0, 4)),
    fiscalPeriodEnd,
    quarter,
    accountingScope,
    accountingStandard,
    revenue: findFact(facts, [/Revenue/i, /NetSales/i, /OperatingRevenue/i], currentContexts),
    operatingIncome: findFact(facts, [/OperatingIncome/i, /OperatingProfit/i], currentContexts),
    ordinaryIncome: findFact(facts, [/OrdinaryIncome/i], currentContexts),
    profitAttributableToOwners: findFact(
      facts,
      [/ProfitAttributableToOwnersOfParent/i, /NetIncomeAttributableToOwners/i, /ProfitLossAttributableToOwners/i],
      currentContexts
    ),
    operatingCF: findFact(facts, [/NetCashProvidedByUsedInOperatingActivities/i], currentContexts),
    investingCF: findFact(facts, [/NetCashProvidedByUsedInInvestingActivities/i], currentContexts),
    financingCF: findFact(facts, [/NetCashProvidedByUsedInFinancingActivities/i], currentContexts),
    totalAssets: findFact(facts, [/Assets$/i, /TotalAssets/i], currentContexts),
    netAssets: findFact(facts, [/NetAssets/i], currentContexts),
    equity: findFact(facts, [/Equity$/i, /ShareholdersEquity/i], currentContexts),
    earningsForecastRevenue: findFact(facts, [/Forecast.*(?:Revenue|NetSales|OperatingRevenue)/i]),
    earningsForecastOperatingIncome: findFact(facts, [/Forecast.*Operating(?:Income|Profit)/i]),
    earningsForecastOrdinaryIncome: findFact(facts, [/Forecast.*OrdinaryIncome/i]),
    earningsForecastProfit: findFact(facts, [/Forecast.*Profit/i]),
    rawFinancials,
  };
}

async function fetchBuffer(url: string) {
  const response = await fetch(url, { headers: { "user-agent": userAgent } });
  if (!response.ok) throw new Error(`${url} の取得に失敗: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "user-agent": userAgent } });
  if (!response.ok) throw new Error(`${url} の取得に失敗: ${response.status}`);
  return response.text();
}

function tdnetListUrl(date: string, page: number) {
  const yyyymmdd = date.replace(/-/g, "");
  const pageText = String(page).padStart(3, "0");
  return listTemplate
    .replace("{date}", date)
    .replace("{yyyymmdd}", yyyymmdd)
    .replace("{page}", pageText)
    .replace(/I_list_\d{3}_/, `I_list_${pageText}_`);
}

function targetDates() {
  const explicit = process.argv.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (explicit) return [explicit];
  const lookback = Math.min(7, Math.max(1, Number(process.env.TDNET_LOOKBACK_DAYS ?? "3")));
  return Array.from({ length: lookback }, (_, index) => {
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(date);
  });
}

async function loadCompanies() {
  const rows: Company[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("all_market_companies")
      .select("id, ticker, company_name")
      .eq("listing_status", "listed")
      .range(from, from + 999);
    if (error) throw new Error(`会社マスタ取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as Company[]));
    if ((data ?? []).length < 1000) break;
  }
  return new Map(rows.map((row) => [row.ticker, row]));
}

async function saveCandidate(candidate: DisclosureCandidate, company: Company) {
  const { data: existing } = await supabaseAdmin
    .from("company_disclosures")
    .select("id")
    .eq("source", "tdnet")
    .eq("source_document_id", candidate.sourceDocumentId)
    .maybeSingle();

  let parsed: ParsedFinancials | null = null;
  let extractionError: string | null = null;
  if (candidate.xbrlUrl && candidate.quarter) {
    try {
      parsed = parseXbrl(
        await fetchBuffer(candidate.xbrlUrl),
        candidate.quarter,
        candidate.disclosedAt
      );
    } catch (error) {
      extractionError = error instanceof Error ? error.message : String(error);
    }
  }

  const { data: disclosure, error: disclosureError } = await supabaseAdmin
    .from("company_disclosures")
    .upsert(
      {
        company_id: company.id,
        ticker: company.ticker,
        source: "tdnet",
        source_document_id: candidate.sourceDocumentId,
        document_type: candidate.documentType,
        title: candidate.title,
        disclosed_at: candidate.disclosedAt,
        fiscal_year: parsed?.fiscalYear ?? null,
        fiscal_period_end: parsed?.fiscalPeriodEnd ?? null,
        quarter: candidate.quarter,
        cumulative: true,
        accounting_scope: parsed?.accountingScope ?? "unknown",
        accounting_standard: parsed?.accountingStandard ?? null,
        source_url: candidate.sourceUrl,
        xbrl_url: candidate.xbrlUrl,
        pdf_url: candidate.pdfUrl,
        raw_payload: {
          candidate,
          extractionError,
          extractionVersion: "tdnet-quarterly-v2",
        },
        is_correction: candidate.isCorrection,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source,source_document_id" }
    )
    .select("id")
    .single();
  if (disclosureError) throw new Error(`開示保存失敗 ${candidate.ticker}: ${disclosureError.message}`);

  if (parsed && candidate.quarter) {
    const { error } = await supabaseAdmin.from("company_quarterly_financials").upsert(
      {
        company_id: company.id,
        disclosure_id: disclosure.id,
        ticker: company.ticker,
        fiscal_year: parsed.fiscalYear,
        fiscal_period_end: parsed.fiscalPeriodEnd,
        quarter: candidate.quarter,
        cumulative: true,
        accounting_scope: parsed.accountingScope,
        accounting_standard: parsed.accountingStandard,
        revenue: parsed.revenue,
        operating_income: parsed.operatingIncome,
        ordinary_income: parsed.ordinaryIncome,
        profit_attributable_to_owners: parsed.profitAttributableToOwners,
        operating_cf: parsed.operatingCF,
        investing_cf: parsed.investingCF,
        financing_cf: parsed.financingCF,
        total_assets: parsed.totalAssets,
        net_assets: parsed.netAssets,
        equity: parsed.equity,
        earnings_forecast_revenue: parsed.earningsForecastRevenue,
        earnings_forecast_operating_income: parsed.earningsForecastOperatingIncome,
        earnings_forecast_ordinary_income: parsed.earningsForecastOrdinaryIncome,
        earnings_forecast_profit: parsed.earningsForecastProfit,
        data_quality: [parsed.revenue, parsed.operatingIncome].some((value) => value !== null)
          ? "unreviewed"
          : "warning",
        extraction_version: "tdnet-quarterly-v2",
        raw_financials: parsed.rawFinancials,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,fiscal_period_end,quarter,accounting_scope" }
    );
    if (error) throw new Error(`四半期数値保存失敗 ${candidate.ticker}: ${error.message}`);
  }

  if (extractionError) {
    throw new Error(`XBRL抽出失敗 ${candidate.ticker}: ${extractionError}`);
  }

  return existing ? "updated" : "inserted";
}
async function main() {
  const dates = targetDates();
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabaseAdmin
    .from("data_import_runs")
    .insert({
      import_type: "tdnet_quarterly_daily",
      status: "running",
      source: "TDnet public disclosure service",
      started_at: startedAt,
      metadata: { dates, listTemplate },
    })
    .select("id")
    .single();
  if (runError) throw new Error(`実行履歴作成失敗: ${runError.message}`);

  try {
    const companies = await loadCompanies();
    const candidates: DisclosureCandidate[] = [];
    const listFailures: string[] = [];

    for (const date of dates) {
      for (let page = 1; page <= 50; page += 1) {
        const url = tdnetListUrl(date, page);
        try {
          candidates.push(...parseCandidates(await fetchText(url), url, date));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (page === 1 || !message.includes(": 404")) {
            listFailures.push(`${date} page ${page}: ${message}`);
          }
          break;
        }
      }
    }

    const unique = [...new Map(candidates.map((candidate) => [candidate.sourceDocumentId, candidate])).values()];
    let successCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];

    for (const candidate of unique) {
      const company = companies.get(candidate.ticker);
      if (!company) {
        skippedCount += 1;
        continue;
      }
      try {
        await saveCandidate(candidate, company);
        successCount += 1;
      } catch (error) {
        failures.push(`${candidate.ticker}:${candidate.sourceDocumentId} ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const allFailures = [...listFailures, ...failures];
    const status = allFailures.length === 0 ? "success" : successCount > 0 ? "partial" : "failed";
    await supabaseAdmin
      .from("data_import_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        total_count: unique.length,
        success_count: successCount,
        failure_count: allFailures.length,
        metadata: {
          dates,
          candidates: unique.length,
          saved: successCount,
          skippedUnknownTicker: skippedCount,
          listFailures,
          failures: failures.slice(0, 100),
        },
        error_summary: allFailures.slice(0, 20).join(" | ") || null,
      })
      .eq("id", run.id);

    console.log("===== TDnet Quarterly Sync =====");
    console.log("Dates:", dates.join(", "));
    console.log("Candidates:", unique.length);
    console.log("Saved:", successCount);
    console.log("Unknown ticker:", skippedCount);
    console.log("Failures:", allFailures.length);

    if (status === "failed") process.exitCode = 1;
  } catch (error) {
    await supabaseAdmin
      .from("data_import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        failure_count: 1,
        error_summary: error instanceof Error ? error.message : String(error),
      })
      .eq("id", run.id);
    throw error;
  }
}

main().catch((error) => {
  console.error("TDnet四半期同期に失敗しました。", error);
  process.exit(1);
});
