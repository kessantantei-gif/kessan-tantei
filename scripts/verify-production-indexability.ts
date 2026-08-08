import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../lib/supabase";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp").replace(/\/$/, "");
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const NORMAL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const REQUIRED_MARKETS = ["growth", "prime", "standard"] as const;
const REGRESSION_TICKERS = ["5870", "3178", "8202", "7581", "6702"];

type CompanyRow = {
  ticker: string;
  company_name: string;
  market_segment: string | null;
};

type AnalysisRow = {
  ticker: string;
  risk_level: string | null;
};

type FetchResult = {
  url: string;
  status: number;
  location: string | null;
  xRobotsTag: string | null;
  contentType: string | null;
  body: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchText(url: string, userAgent = GOOGLEBOT_UA, redirect: RequestRedirect = "follow"): Promise<FetchResult> {
  const response = await fetch(url, {
    redirect,
    headers: {
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ja,en-US;q=0.8,en;q=0.6",
    },
  });
  const body = await response.text();
  return {
    url: response.url,
    status: response.status,
    location: response.headers.get("location"),
    xRobotsTag: response.headers.get("x-robots-tag"),
    contentType: response.headers.get("content-type"),
    body,
  };
}

function hasNoindex(html: string) {
  return /<meta[^>]+name=["'](?:robots|googlebot)["'][^>]+content=["'][^"']*noindex/i.test(html) ||
    /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["'](?:robots|googlebot)["']/i.test(html);
}

function canonicalFromHtml(html: string) {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return match?.[1] ?? null;
}

async function loadSamples() {
  const [{ data: companies, error: companyError }, { data: analyses, error: analysisError }] = await Promise.all([
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, market_segment")
      .eq("listing_status", "listed")
      .in("market_segment", REQUIRED_MARKETS)
      .order("ticker", { ascending: true }),
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, risk_level")
      .neq("risk_level", "EXCLUDED"),
  ]);

  if (companyError) throw new Error(`本番監査用の上場企業取得失敗: ${companyError.message}`);
  if (analysisError) throw new Error(`本番監査用の分析企業取得失敗: ${analysisError.message}`);

  const listed = (companies ?? []) as CompanyRow[];
  const analyzed = new Set(((analyses ?? []) as AnalysisRow[]).map((row) => row.ticker));
  const byTicker = new Map(listed.map((row) => [row.ticker, row]));
  const samples = new Map<string, CompanyRow>();

  for (const ticker of REGRESSION_TICKERS) {
    const row = byTicker.get(ticker);
    if (row) samples.set(row.ticker, row);
  }

  for (const market of REQUIRED_MARKETS) {
    const marketRows = listed.filter((row) => row.market_segment === market);
    const analyzedRow = marketRows.find((row) => analyzed.has(row.ticker));
    const preparationRow = marketRows.find((row) => !analyzed.has(row.ticker));
    const middleRow = marketRows[Math.floor(marketRows.length / 2)];
    const lastRow = marketRows.at(-1);
    for (const row of [analyzedRow, preparationRow, middleRow, lastRow]) {
      if (row) samples.set(row.ticker, row);
    }
  }

  return {
    listed,
    analyzed,
    samples: [...samples.values()],
  };
}

async function verifyRobots() {
  const result = await fetchText(`${SITE_URL}/robots.txt`);
  assert(result.status === 200, `robots.txt が ${result.status} を返しました`);
  assert(/User-agent:\s*\*/i.test(result.body), "robots.txt に User-agent: * がありません");
  assert(/Allow:\s*\//i.test(result.body), "robots.txt が / を明示許可していません");
  assert(!/Disallow:\s*\/company/i.test(result.body), "robots.txt が /company をブロックしています");
  assert(result.body.includes(`${SITE_URL}/sitemap.xml`), "robots.txt の sitemap URL が正規URLではありません");
}

async function verifySitemap(listedCount: number, samples: CompanyRow[]) {
  const result = await fetchText(`${SITE_URL}/sitemap.xml`);
  assert(result.status === 200, `sitemap.xml が ${result.status} を返しました`);
  assert((result.contentType || "").includes("xml"), `sitemap.xml の Content-Type がXMLではありません: ${result.contentType}`);
  assert(!result.body.includes("https://www.kessan-tantei.jp"), "sitemap に www URL が混入しています");
  assert(!result.body.includes(`${SITE_URL}/growth</loc>`), "リダイレクトURL /growth が sitemap に含まれています");

  const companyUrlCount = (result.body.match(/<loc>https:\/\/kessan-tantei\.jp\/company\//g) || []).length;
  assert(companyUrlCount === listedCount, `sitemap の会社URL数(${companyUrlCount})が上場会社数(${listedCount})と一致しません`);

  for (const company of samples) {
    assert(result.body.includes(`<loc>${SITE_URL}/company/${company.ticker}</loc>`), `sitemap に ${company.ticker} がありません`);
  }
}

async function verifyStaticPages() {
  const paths = ["/", "/markets", "/latest-earnings", "/companies/growth", "/companies/prime", "/companies/standard"];
  for (const path of paths) {
    const expectedUrl = `${SITE_URL}${path}`;
    const result = await fetchText(expectedUrl);
    assert(result.status === 200, `${path} が ${result.status} を返しました`);
    assert(!result.xRobotsTag?.toLowerCase().includes("noindex"), `${path} の X-Robots-Tag に noindex があります`);
    assert(!hasNoindex(result.body), `${path} のHTMLに noindex があります`);
    const canonical = canonicalFromHtml(result.body);
    assert(canonical === expectedUrl, `${path} の canonical が不正です: ${canonical}`);
  }
}

async function verifyCompany(company: CompanyRow) {
  const expectedUrl = `${SITE_URL}/company/${company.ticker}`;
  const [googlebot, normal] = await Promise.all([
    fetchText(expectedUrl, GOOGLEBOT_UA),
    fetchText(expectedUrl, NORMAL_UA),
  ]);

  for (const [label, result] of [["Googlebot", googlebot], ["通常UA", normal]] as const) {
    assert(result.status === 200, `${company.ticker} ${label} が ${result.status} を返しました`);
    assert(result.url === expectedUrl, `${company.ticker} ${label} が別URLへ遷移しました: ${result.url}`);
    assert(!result.xRobotsTag?.toLowerCase().includes("noindex"), `${company.ticker} ${label} の X-Robots-Tag に noindex があります`);
    assert(!hasNoindex(result.body), `${company.ticker} ${label} のHTMLに noindex があります`);
    assert(canonicalFromHtml(result.body) === expectedUrl, `${company.ticker} ${label} の canonical が自己参照ではありません`);
    assert(result.body.includes(company.ticker), `${company.ticker} ${label} のHTMLに証券コードがありません`);
    assert(result.body.includes(company.company_name), `${company.ticker} ${label} のHTMLに会社名がありません`);
    assert(result.body.length > 1500, `${company.ticker} ${label} のHTMLが短すぎます (${result.body.length} bytes)`);
  }
}

async function verifyHostCanonicalization() {
  const vercel = await fetchText("https://kessan-tantei.vercel.app/", GOOGLEBOT_UA, "manual");
  assert([301, 302, 307, 308].includes(vercel.status), `vercel.app が正規ドメインへリダイレクトしていません: ${vercel.status}`);
  assert(vercel.location?.startsWith(`${SITE_URL}/`), `vercel.app の転送先が不正です: ${vercel.location}`);

  const www = await fetchText("https://www.kessan-tantei.jp/", GOOGLEBOT_UA, "manual");
  assert([301, 302, 307, 308].includes(www.status), `www が正規ドメインへリダイレクトしていません: ${www.status}`);
  assert(www.location?.startsWith(`${SITE_URL}/`), `www の転送先が不正です: ${www.location}`);
}

async function main() {
  const { listed, analyzed, samples } = await loadSamples();
  assert(listed.length > 3000, `上場会社数が想定より少なすぎます: ${listed.length}`);
  assert(samples.length >= 8, `監査サンプルが少なすぎます: ${samples.length}`);

  await verifyRobots();
  await verifySitemap(listed.length, samples);
  await verifyStaticPages();
  await verifyHostCanonicalization();

  for (const company of samples) {
    await verifyCompany(company);
  }

  console.log("===== Production indexability verification =====");
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    siteUrl: SITE_URL,
    listedCompanies: listed.length,
    analyzedCompanies: analyzed.size,
    preparationCompanies: listed.filter((row) => !analyzed.has(row.ticker)).length,
    sampleCount: samples.length,
    samples: samples.map((row) => ({ ticker: row.ticker, companyName: row.company_name, market: row.market_segment, analyzed: analyzed.has(row.ticker) })),
    result: "PASS",
  }, null, 2));
}

main().catch((error) => {
  console.error("Production indexability verification FAILED");
  console.error(error);
  process.exitCode = 1;
});
