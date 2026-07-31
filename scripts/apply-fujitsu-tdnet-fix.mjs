import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`${label} の置換対象が見つかりません`);
  }
  return source.replace(before, after);
}

const syncPath = "scripts/sync-tdnet-quarterly.ts";
let sync = fs.readFileSync(syncPath, "utf8");

if (!sync.includes("function latestContextPeriodEnd")) {
  sync = replaceOnce(
    sync,
    `function parseXbrl(buffer: Buffer, quarter: 1 | 2 | 3 | 4): ParsedFinancials {`,
    `function latestContextPeriodEnd(xml: string, disclosedAt: string) {
  const cutoff = disclosedAt.slice(0, 10);
  const dates = [
    ...xml.matchAll(
      /<(?:[A-Za-z_][\\w.-]*:)?(?:endDate|instant)\\b[^>]*>\\s*(20\\d{2}-\\d{2}-\\d{2})\\s*<\\//gi
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
): ParsedFinancials {`,
    "XBRL期間フォールバック追加"
  );

  sync = replaceOnce(
    sync,
    `  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
  const parsed = parser.parse(instance.getData().toString("utf8"));`,
    `  const xml = instance.getData().toString("utf8");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
  const parsed = parser.parse(xml);`,
    "XBRL XML文字列保持"
  );

  const oldPeriodBlock = `  const fiscalPeriodEnd = parseDate(
    findText(facts, [
      /CurrentFiscalYearEndDate/i,
      /CurrentPeriodEndDate/i,
      /FiscalYearEndDate/i,
      /Current.*EndDate/i,
    ])
  );
  if (!fiscalPeriodEnd) throw new Error("決算期末日をXBRLから取得できません");`;

  const newPeriodBlock = `  const fiscalYearEnd = parseDate(
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
  if (!fiscalPeriodEnd) throw new Error("決算期末日をXBRLから取得できません");`;

  sync = replaceOnce(sync, oldPeriodBlock, newPeriodBlock, "決算期末日抽出ロジック");
  sync = replaceOnce(
    sync,
    `    fiscalYear: Number(fiscalPeriodEnd.slice(0, 4)),`,
    `    fiscalYear: Number((fiscalYearEnd ?? fiscalPeriodEnd).slice(0, 4)),`,
    "会計年度抽出"
  );
}

const saveStart = sync.indexOf("async function saveCandidate(");
const saveEnd = sync.indexOf("\nasync function main()", saveStart);
if (saveStart < 0 || saveEnd < 0) {
  throw new Error("saveCandidate関数の範囲を特定できません");
}

const replacementSaveCandidate = `async function saveCandidate(candidate: DisclosureCandidate, company: Company) {
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
  if (disclosureError) throw new Error(\`開示保存失敗 \${candidate.ticker}: \${disclosureError.message}\`);

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
    if (error) throw new Error(\`四半期数値保存失敗 \${candidate.ticker}: \${error.message}\`);
  }

  if (extractionError) {
    throw new Error(\`XBRL抽出失敗 \${candidate.ticker}: \${extractionError}\`);
  }

  return existing ? "updated" : "inserted";
}`;

sync = `${sync.slice(0, saveStart)}${replacementSaveCandidate}${sync.slice(saveEnd)}`;
fs.writeFileSync(syncPath, sync);

const pagePath = "app/company/[ticker]/page.tsx";
let page = fs.readFileSync(pagePath, "utf8");

if (!page.includes('export const dynamic = "force-dynamic";')) {
  page = replaceOnce(
    page,
    `type PageProps = {
  params: Promise<{ ticker: string }>;
};`,
    `type PageProps = {
  params: Promise<{ ticker: string }>;
};

export const dynamic = "force-dynamic";`,
    "企業ページ動的レンダリング"
  );
}

if (!page.includes("const { data: latestDisclosure }")) {
  page = replaceOnce(
    page,
    `  const companyNews = await getCompanyNews(ticker, 5);

  const { data: quarterlyRows } = await supabaseAdmin`,
    `  const companyNews = await getCompanyNews(ticker, 5);

  const { data: latestDisclosure } = await supabaseAdmin
    .from("company_disclosures")
    .select("title, disclosed_at, document_type, source_url, xbrl_url, pdf_url")
    .eq("ticker", ticker)
    .order("disclosed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: quarterlyRows } = await supabaseAdmin`,
    "最新開示取得"
  );

  page = replaceOnce(
    page,
    `  const financials = data.financials ?? {};`,
    `  const latestDisclosureHref =
    latestDisclosure?.pdf_url ??
    latestDisclosure?.xbrl_url ??
    latestDisclosure?.source_url ??
    null;
  const latestDisclosureDate = latestDisclosure?.disclosed_at
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(latestDisclosure.disclosed_at))
    : null;

  const financials = data.financials ?? {};`,
    "最新開示表示用データ"
  );

  page = replaceOnce(
    page,
    `        <CompanyFinancialTrends annualHistory={history} quarterlyHistory={quarterlyHistory} />`,
    `        {latestDisclosure ? (
          <section className="mt-4 rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-4 backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-black tracking-[0.24em] text-cyan-200 sm:text-sm">
                  LATEST DISCLOSURE
                </p>
                <h2 className="mt-2 text-xl font-black leading-snug sm:text-2xl">
                  {latestDisclosure.title}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  TDnet開示日時: {latestDisclosureDate ?? "日時不明"}
                </p>
              </div>
              {latestDisclosureHref ? (
                <a
                  href={latestDisclosureHref}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-cyan-200/30 bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
                >
                  開示資料を確認 ↗
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <CompanyFinancialTrends annualHistory={history} quarterlyHistory={quarterlyHistory} />`,
    "最新開示バナー"
  );
}

fs.writeFileSync(pagePath, page);
console.log("TDnet XBRL抽出・開示保存・企業ページ表示の恒久修正を適用しました");
