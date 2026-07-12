import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { industryThemeLabels, type IndustryTheme } from "@/lib/industry-classifier";
import { loadRuntimeCompanyMasterEntries } from "@/lib/company-master-runtime";
import { seoThemeDescriptions, seoThemeIds } from "@/lib/seo-hubs";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp";

type Props = {
  params: Promise<{ slug: string }>;
};

type CompanyRow = {
  ticker: string;
  company_name: string;
  score: number | null;
  danger_score: number | null;
  risk_level: string | null;
  financials: Record<string, number | null | undefined> | null;
};

function isTheme(value: string): value is IndustryTheme {
  return seoThemeIds.includes(value as IndustryTheme);
}

function pct(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
    : "—";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isTheme(slug)) return {};

  const label = industryThemeLabels[slug];
  const title = `${label}関連のグロース企業一覧・財務比較 | 決算探偵`;
  const description = seoThemeDescriptions[slug];
  const url = `${appUrl}/themes/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "決算探偵", type: "website", locale: "ja_JP" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ThemeDetailPage({ params }: Props) {
  const { slug } = await params;
  if (!isTheme(slug)) notFound();

  const entries = await loadRuntimeCompanyMasterEntries();
  const themeEntries = entries.filter((entry) => entry.themeId === slug);
  const tickers = themeEntries.map((entry) => entry.ticker);

  const { data } = tickers.length
    ? await supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, score, danger_score, risk_level, financials")
        .in("ticker", tickers)
        .neq("risk_level", "EXCLUDED")
        .limit(500)
    : { data: [] };

  const masterMap = new Map(themeEntries.map((entry) => [entry.ticker, entry]));
  const companies = ((data ?? []) as CompanyRow[]).sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1)
  );
  const label = industryThemeLabels[slug];
  const url = `${appUrl}/themes/${slug}`;

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${label}関連のグロース企業一覧`,
    url,
    numberOfItems: companies.length,
    itemListElement: companies.map((company, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `${company.company_name}（${company.ticker}）`,
      url: `${appUrl}/company/${company.ticker}`,
    })),
  };

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-10 text-white sm:px-8 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto max-w-7xl">
        <nav className="text-sm text-slate-500">
          <Link href="/themes" className="hover:text-white">テーマ別一覧</Link>
          <span className="mx-2">/</span>
          <span>{label}</span>
        </nav>

        <section className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-6 sm:p-10">
          <p className="text-xs font-black tracking-[0.3em] text-cyan-300">THEME ANALYSIS</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-6xl">{label}関連のグロース企業</h1>
          <p className="mt-5 max-w-4xl leading-8 text-slate-300">{seoThemeDescriptions[slug]}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold">
            <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2">掲載 {companies.length}社</span>
            <Link href="/ranking/score" className="rounded-full border border-green-300/20 bg-green-400/10 px-4 py-2 text-green-200">財務スコアランキング</Link>
            <Link href="/ranking/revenue-growth" className="rounded-full border border-yellow-300/20 bg-yellow-400/10 px-4 py-2 text-yellow-200">売上成長率ランキング</Link>
          </div>
        </section>

        {companies.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-400">
            現在、このテーマに分類された公開企業はありません。
          </div>
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {companies.map((company, index) => {
              const master = masterMap.get(company.ticker);
              return (
                <Link
                  key={company.ticker}
                  href={`/company/${company.ticker}`}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black text-cyan-300">#{index + 1} / {company.ticker}</p>
                      <h2 className="mt-2 text-xl font-black">{company.company_name}</h2>
                      <p className="mt-2 text-sm text-slate-400">{master?.subTheme || label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">財務スコア</p>
                      <p className="mt-1 text-3xl font-black text-green-300">{company.score ?? "—"}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-2xl bg-black/20 p-3"><p className="text-xs text-slate-500">売上成長率</p><p className="mt-1 font-black">{pct(company.financials?.revenueGrowth)}</p></div>
                    <div className="rounded-2xl bg-black/20 p-3"><p className="text-xs text-slate-500">営業利益率</p><p className="mt-1 font-black">{pct(company.financials?.operatingMargin)}</p></div>
                    <div className="rounded-2xl bg-black/20 p-3"><p className="text-xs text-slate-500">Danger</p><p className="mt-1 font-black text-red-200">{company.danger_score ?? "—"}</p></div>
                  </div>
                  <span className="mt-5 inline-flex text-sm font-black text-cyan-200">会社の決算分析を見る →</span>
                </Link>
              );
            })}
          </div>
        )}

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <Link href="/features" className="rounded-3xl border border-yellow-300/20 bg-yellow-400/10 p-6">
            <h2 className="text-xl font-black">財務特徴から企業を探す</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">高成長、営業CF、利益率改善、赤字成長、リスクなどの決算特徴から比較します。</p>
            <span className="mt-4 inline-flex font-black text-yellow-200">一覧を見る →</span>
          </Link>
          <Link href="/ranking" className="rounded-3xl border border-green-300/20 bg-green-400/10 p-6">
            <h2 className="text-xl font-black">全ランキングを見る</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">成長性、収益性、キャッシュ、安全性、リスクの各指標で全社を比較します。</p>
            <span className="mt-4 inline-flex font-black text-green-200">ランキングへ →</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
