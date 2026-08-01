import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "最新決算一覧｜日本株の決算発表・業績速報 | 決算探偵",
  description:
    "日本株の最新決算発表を、会社名・証券コード・売上高・営業利益・営業キャッシュフローとともに一覧化。プライム・スタンダード・グロースの決算を財務データから確認できます。",
  alternates: {
    canonical: "/latest-earnings",
  },
  openGraph: {
    title: "日本株の最新決算一覧 | 決算探偵",
    description:
      "最新の決算短信を、売上・営業利益・営業CFとともに確認できます。",
    url: "https://kessan-tantei.jp/latest-earnings",
    siteName: "決算探偵",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "https://kessan-tantei.jp/og-image-all-markets.png",
        width: 1200,
        height: 630,
        alt: "決算探偵 最新決算一覧",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "日本株の最新決算一覧 | 決算探偵",
    description: "最新決算を売上・営業利益・営業CFとともに確認できます。",
    images: ["https://kessan-tantei.jp/og-image-all-markets.png"],
  },
};

type DisclosureRow = {
  id: string;
  ticker: string;
  title: string;
  disclosed_at: string;
  document_type: string;
  source_url: string | null;
  pdf_url: string | null;
  xbrl_url: string | null;
};

type CompanyRow = {
  ticker: string;
  company_name: string;
  market_segment: string;
  industry_name: string | null;
};

type QuarterlySnapshot = {
  disclosure_id: string;
  fiscal_period_end: string;
  quarter: number;
  accounting_scope: string;
  revenue: number | null;
  operating_income: number | null;
  ordinary_income: number | null;
  profit_attributable_to_owners: number | null;
  operating_cf: number | null;
};

const earningsTypes = [
  "q1_earnings",
  "q2_earnings",
  "q3_earnings",
  "annual_earnings",
  "correction",
];

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function loadLatestDisclosures() {
  const { data, error } = await supabaseAdmin
    .from("company_disclosures")
    .select("id, ticker, title, disclosed_at, document_type, source_url, pdf_url, xbrl_url")
    .eq("source", "tdnet")
    .in("document_type", earningsTypes)
    .not("ticker", "is", null)
    .order("disclosed_at", { ascending: false })
    .limit(120);

  if (error) throw new Error(`最新決算取得失敗: ${error.message}`);
  return (data ?? []) as DisclosureRow[];
}

async function loadCompanies(tickers: string[]) {
  if (tickers.length === 0) return [];

  const batches = await Promise.all(
    chunk([...new Set(tickers)], 60).map(async (batch) => {
      const { data, error } = await supabaseAdmin
        .from("all_market_companies")
        .select("ticker, company_name, market_segment, industry_name")
        .eq("listing_status", "listed")
        .in("ticker", batch);
      if (error) throw new Error(`最新決算企業マスタ取得失敗: ${error.message}`);
      return (data ?? []) as CompanyRow[];
    })
  );

  return batches.flat();
}

async function loadQuarterlySnapshots(disclosureIds: string[]) {
  if (disclosureIds.length === 0) return [];

  const batches = await Promise.all(
    chunk(disclosureIds, 40).map(async (batch) => {
      const { data, error } = await supabaseAdmin
        .from("company_quarterly_financials")
        .select(
          "disclosure_id, fiscal_period_end, quarter, accounting_scope, revenue, operating_income, ordinary_income, profit_attributable_to_owners, operating_cf"
        )
        .in("disclosure_id", batch);
      if (error) throw new Error(`最新決算数値取得失敗: ${error.message}`);
      return (data ?? []) as QuarterlySnapshot[];
    })
  );

  return batches.flat();
}

function marketLabel(value: string) {
  if (value === "prime") return "プライム";
  if (value === "standard") return "スタンダード";
  if (value === "growth") return "グロース";
  return "その他";
}

function documentLabel(value: string, quarter?: number | null) {
  if (value === "correction") return "訂正決算";
  if (quarter === 1 || value === "q1_earnings") return "第1四半期";
  if (quarter === 2 || value === "q2_earnings") return "第2四半期・中間期";
  if (quarter === 3 || value === "q3_earnings") return "第3四半期";
  if (quarter === 4 || value === "annual_earnings") return "通期決算";
  return "決算発表";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPeriod(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T12:00:00+09:00`));
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const oku = value / 100_000_000;
  if (Math.abs(oku) >= 1) {
    return `${oku.toLocaleString("ja-JP", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    })}億円`;
  }
  return `${Math.round(value / 1_000_000).toLocaleString("ja-JP")}百万円`;
}

function disclosureHref(row: DisclosureRow) {
  return row.pdf_url ?? row.xbrl_url ?? row.source_url;
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function LatestEarningsPage() {
  const disclosures = await loadLatestDisclosures();
  const [companies, snapshots] = await Promise.all([
    loadCompanies(disclosures.map((row) => row.ticker)),
    loadQuarterlySnapshots(disclosures.map((row) => row.id)),
  ]);

  const companyByTicker = new Map(companies.map((company) => [company.ticker, company]));
  const snapshotByDisclosure = new Map(
    snapshots.map((snapshot) => [snapshot.disclosure_id, snapshot])
  );

  const visibleDisclosures = disclosures
    .filter((row) => companyByTicker.has(row.ticker))
    .slice(0, 100);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "日本株の最新決算一覧",
    numberOfItems: visibleDisclosures.length,
    itemListElement: visibleDisclosures.slice(0, 30).map((row, index) => {
      const company = companyByTicker.get(row.ticker)!;
      return {
        "@type": "ListItem",
        position: index + 1,
        url: `https://kessan-tantei.jp/company/${row.ticker}`,
        name: `${company.company_name}（${row.ticker}） ${row.title}`,
      };
    }),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "決算探偵",
        item: "https://kessan-tantei.jp/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "最新決算一覧",
        item: "https://kessan-tantei.jp/latest-earnings",
      },
    ],
  };

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
          <p className="text-xs font-black tracking-[0.28em] text-cyan-300 sm:text-sm">
            LATEST JAPAN EARNINGS
          </p>
          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-6xl">
            日本株の最新決算一覧
          </h1>
          <p className="mt-5 max-w-4xl text-sm leading-7 text-slate-300 sm:text-lg sm:leading-9">
            プライム・スタンダード・グロース市場の最新決算短信を、会社名・証券コード・売上高・営業利益・営業キャッシュフローとともに整理しています。各企業ページでは、決算推移、財務スコア、注意すべきリスクを確認できます。
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold">
            <Link
              href="/ranking"
              className="rounded-full bg-green-400 px-4 py-2 text-slate-950 transition hover:bg-green-300"
            >
              財務ランキングを見る
            </Link>
            <Link
              href="/markets"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:bg-white/10"
            >
              市場から探す
            </Link>
            <Link
              href="/updates"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:bg-white/10"
            >
              今日の更新を見る
            </Link>
          </div>
        </div>

        <section className="mt-6" aria-labelledby="latest-earnings-heading">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 id="latest-earnings-heading" className="text-2xl font-black sm:text-3xl">
                新着の決算発表
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                TDnetの決算短信を新しい順に掲載しています。
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold text-cyan-300">
              {visibleDisclosures.length}件
            </p>
          </div>

          {visibleDisclosures.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
              現在表示できる決算発表はありません。
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleDisclosures.map((row) => {
                const company = companyByTicker.get(row.ticker)!;
                const snapshot = snapshotByDisclosure.get(row.id);
                const sourceHref = disclosureHref(row);
                const metrics = [
                  { label: "売上高", value: formatMoney(snapshot?.revenue ?? null) },
                  {
                    label: "営業利益",
                    value: formatMoney(snapshot?.operating_income ?? null),
                  },
                  {
                    label: "親会社利益",
                    value: formatMoney(snapshot?.profit_attributable_to_owners ?? null),
                  },
                  { label: "営業CF", value: formatMoney(snapshot?.operating_cf ?? null) },
                ].filter((metric) => metric.value !== null);

                return (
                  <article
                    key={row.id}
                    className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl transition hover:border-cyan-300/30 hover:bg-white/[0.07] sm:p-6"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-200">
                        {documentLabel(row.document_type, snapshot?.quarter)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-slate-300">
                        {marketLabel(company.market_segment)}
                      </span>
                      {company.industry_name ? (
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-slate-400">
                          {company.industry_name}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-4 text-xl font-black leading-snug sm:text-2xl">
                      <Link
                        href={`/company/${row.ticker}`}
                        className="transition hover:text-cyan-200"
                      >
                        {company.company_name}（{row.ticker}）
                      </Link>
                    </h3>

                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-300">
                      {row.title}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <time dateTime={row.disclosed_at}>{formatDate(row.disclosed_at)}発表</time>
                      {snapshot?.fiscal_period_end ? (
                        <span>対象期末: {formatPeriod(snapshot.fiscal_period_end)}</span>
                      ) : null}
                      {snapshot?.accounting_scope ? (
                        <span>
                          {snapshot.accounting_scope === "consolidated"
                            ? "連結"
                            : snapshot.accounting_scope === "non_consolidated"
                              ? "非連結"
                              : "区分不明"}
                        </span>
                      ) : null}
                    </div>

                    {metrics.length > 0 ? (
                      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {metrics.map((metric) => (
                          <div
                            key={metric.label}
                            className="rounded-2xl border border-white/10 bg-black/20 p-3"
                          >
                            <dt className="text-[11px] text-slate-500">{metric.label}</dt>
                            <dd className="mt-1 break-words text-sm font-black text-white">
                              {metric.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                        数値データを確認中です。開示資料と企業ページは閲覧できます。
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap gap-3 text-sm font-black">
                      <Link
                        href={`/company/${row.ticker}`}
                        className="rounded-full bg-cyan-300 px-4 py-2 text-slate-950 transition hover:bg-cyan-200"
                      >
                        決算・財務分析を見る →
                      </Link>
                      {sourceHref ? (
                        <a
                          href={sourceHref}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                        >
                          開示資料 ↗
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-slate-400 sm:p-6">
          掲載数値はTDnet・EDINET等の開示情報を機械的に整理したものです。訂正開示等により数値が更新される場合があります。本ページは投資助言ではありません。
        </aside>
      </section>
    </main>
  );
}
