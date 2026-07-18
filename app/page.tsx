import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import RankingCard, { type RankingCompany } from "@/components/RankingCard";
import CompanySearch from "@/components/company-search";
import {
  FREE_VISIBLE_S_RANK_LIMIT,
  isProUser,
} from "@/lib/pro-engine";
import { loadAllSupabaseRows } from "@/lib/load-all-supabase-rows";

type NewsItem = {
  id: string | number;
  ticker?: string | null;
  title: string;
  url: string;
  source?: string | null;
  published_at?: string | null;
};

type FocusGroup = {
  label: string;
  title: string;
  description: string;
  tone: "green" | "cyan" | "red";
  companies: RankingCompany[];
};

function formatNewsDate(value?: string | null) {
  if (!value) return "日付不明";

  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isActiveCompany(company: RankingCompany) {
  return company.risk_level !== "EXCLUDED";
}

function byNumber(getter: (company: RankingCompany) => number, desc = true) {
  return (a: RankingCompany, b: RankingCompany) =>
    desc ? getter(b) - getter(a) : getter(a) - getter(b);
}

function applyRankingLock(companies: RankingCompany[], isPro: boolean) {
  if (isPro) return companies;

  return companies.map((company, index) => {
    if (index < FREE_VISIBLE_S_RANK_LIMIT) return company;

    return {
      ...company,
      locked: true,
    };
  });
}

function metricValue(company: RankingCompany, key: string) {
  const value = company.financials?.[key as keyof typeof company.financials];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function focusToneClasses(tone: FocusGroup["tone"]) {
  if (tone === "green") return "border-green-400/20 bg-green-500/10 text-green-200";
  if (tone === "cyan") return "border-cyan-400/20 bg-cyan-500/10 text-cyan-200";
  return "border-red-400/20 bg-red-500/10 text-red-200";
}

async function loadCompanies() {
  const companies = await loadAllSupabaseRows<RankingCompany>(
    "グロース市場ホーム会社取得失敗",
    (from, to) =>
      supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, score, danger_score, risk_level, financials")
        .eq("market_segment", "growth")
        .neq("risk_level", "EXCLUDED")
        .order("ticker", { ascending: true })
        .range(from, to)
  );

  return companies.filter(isActiveCompany);
}

function chunkTickers(tickers: string[], size = 100) {
  const chunks: string[][] = [];
  for (let index = 0; index < tickers.length; index += size) {
    chunks.push(tickers.slice(index, index + size));
  }
  return chunks;
}

async function loadNews(growthTickers: string[]) {
  if (growthTickers.length === 0) return [];

  const batches = await Promise.all(
    chunkTickers(growthTickers).map(async (tickers) => {
      const { data, error } = await supabaseAdmin
        .from("growth_news")
        .select("id, ticker, title, summary, url, source, published_at, created_at")
        .in("ticker", tickers)
        .not("url", "is", null)
        .order("published_at", { ascending: false })
        .limit(3);

      if (error) {
        console.error("グロースニュース取得失敗", error);
        return [];
      }

      return (data ?? []) as NewsItem[];
    })
  );

  return batches
    .flat()
    .sort((a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 3);
}

export default async function HomePage() {
  const companies = await loadCompanies();
  const [news, isPro] = await Promise.all([
    loadNews(companies.map((company) => company.ticker)),
    isProUser(),
  ]);

  const searchCompanies = companies.map((company) => ({
    ticker: company.ticker,
    company_name: company.company_name,
    score: company.score,
    danger_score: company.danger_score,
  }));

  const scoreTopRaw = [...companies].sort(byNumber((c) => c.score)).slice(0, 5);
  const scoreTop = applyRankingLock(scoreTopRaw, isPro);

  const revenueTopRaw = [...companies]
    .filter((c) => (c.financials?.revenue ?? 0) > 0)
    .sort(byNumber((c) => c.financials?.revenue ?? 0))
    .slice(0, 5);
  const revenueTop = applyRankingLock(revenueTopRaw, isPro);

  const operatingIncomeTopRaw = [...companies]
    .filter((c) => (c.financials?.operatingIncome ?? 0) !== 0)
    .sort(byNumber((c) => c.financials?.operatingIncome ?? 0))
    .slice(0, 5);
  const operatingIncomeTop = applyRankingLock(operatingIncomeTopRaw, isPro);

  const operatingCFTopRaw = [...companies]
    .filter((c) => (c.financials?.operatingCF ?? 0) !== 0)
    .sort(byNumber((c) => c.financials?.operatingCF ?? 0))
    .slice(0, 5);
  const operatingCFTop = applyRankingLock(operatingCFTopRaw, isPro);

  const dangerTopRaw = [...companies]
    .sort(byNumber((c) => c.danger_score))
    .slice(0, 5);
  const dangerTop = applyRankingLock(dangerTopRaw, isPro);

  const focusGroups: FocusGroup[] = [
    {
      label: "QUALITY GROWTH",
      title: "高成長かつ営業黒字",
      description: "売上成長率20%以上で、営業利益率がプラスの企業です。",
      tone: "green",
      companies: [...companies]
        .filter(
          (company) =>
            (metricValue(company, "revenueGrowth") ?? -Infinity) >= 20 &&
            (metricValue(company, "operatingMargin") ?? -Infinity) >= 0
        )
        .sort(byNumber((company) => company.score))
        .slice(0, 3),
    },
    {
      label: "CASH IMPROVEMENT",
      title: "営業CF改善",
      description: "営業CFが前期から改善している企業です。",
      tone: "cyan",
      companies: [...companies]
        .filter((company) => (metricValue(company, "operatingCFGrowth") ?? 0) > 0)
        .sort(byNumber((company) => metricValue(company, "operatingCFGrowth") ?? 0))
        .slice(0, 3),
    },
    {
      label: "RISK WATCH",
      title: "リスク要確認",
      description: "Danger Scoreが高く、詳細項目を確認したい企業です。",
      tone: "red",
      companies: [...companies]
        .sort(byNumber((company) => company.danger_score))
        .slice(0, 3),
    },
  ];

  const proRankingLinks = [
    {
      href: "/ranking/margin-improvement",
      label: "利益率改善",
      description: "営業利益率が前期から改善した企業を確認",
    },
    {
      href: "/ranking/ocf-improvement",
      label: "営業CF改善",
      description: "利益だけでなく現金収支が改善した企業を確認",
    },
    {
      href: "/ranking/rule40-excellent",
      label: "Rule of 40",
      description: "成長率と利益率のバランスが高い企業を確認",
    },
    {
      href: "/ranking/risk-signal",
      label: "リスクシグナル",
      description: "Danger ScoreとRed Flagsの詳細を確認",
    },
  ];

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_bottom,_rgba(168,85,247,0.12),transparent_35%)]" />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-10">
          <p className="text-xs tracking-[0.3em] text-green-300 sm:text-sm">
            GROWTH MARKET FINANCIAL DASHBOARD
          </p>

          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-7xl">
            グロース市場を、
            <br />
            決算から見抜く。
          </h1>

          <p className="mt-5 max-w-4xl text-sm leading-7 text-slate-300 sm:mt-6 sm:text-lg sm:leading-9">
            このページでは、グロース市場の企業を決算データから分析します。
            売上成長、営業利益、営業CF、資金繰り、リスクシグナルを横断的に整理し、
            「伸びている会社」と「注意すべき会社」を見える化します。
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/ranking"
              className="inline-flex items-center rounded-2xl bg-green-400 px-5 py-3 font-black text-slate-950 transition hover:bg-green-300"
            >
              決算ランキングを見る →
            </Link>
            <Link
              href="/about-growth"
              className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-5 py-3 font-bold text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              ランキングの考え方
            </Link>
          </div>

          <div className="mt-6 max-w-3xl">
            <CompanySearch companies={searchCompanies} />
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-green-400/20 bg-green-500/10 p-5">
              <p className="text-sm text-green-300">解析済み銘柄</p>
              <p className="mt-2 text-4xl font-black">{companies.length}</p>
            </div>
            <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-5">
              <p className="text-sm text-yellow-300">Pro特典</p>
              <p className="mt-2 text-2xl font-black">ランキング全件</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-5">
              <p className="text-sm text-cyan-300">自動更新</p>
              <p className="mt-2 text-2xl font-black">EDINET連携</p>
            </div>
          </div>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.28em] text-yellow-300">TODAY&apos;S FOCUS</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">今日見るべき企業</h2>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                最新の取得済み決算データから、成長・キャッシュ・リスクの3方向で自動抽出しています。
              </p>
            </div>
            <Link href="/ranking" className="text-sm font-bold text-yellow-200 hover:text-yellow-100">
              全ランキングを見る →
            </Link>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {focusGroups.map((group) => (
              <div key={group.label} className={`rounded-2xl border p-4 ${focusToneClasses(group.tone)}`}>
                <p className="text-[11px] font-black tracking-[0.22em]">{group.label}</p>
                <h3 className="mt-2 text-lg font-black text-white">{group.title}</h3>
                <p className="mt-2 text-xs leading-6 text-slate-400">{group.description}</p>
                <div className="mt-4 space-y-2">
                  {group.companies.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-400">
                      条件に該当する企業は確認中です。
                    </p>
                  ) : (
                    group.companies.map((company, index) => (
                      <Link
                        key={company.ticker}
                        href={`/company/${company.ticker}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm transition hover:bg-white/10"
                      >
                        <span className="min-w-0 truncate font-bold text-white">
                          {index + 1}. {company.company_name}
                        </span>
                        <span className="shrink-0 text-xs font-black text-slate-300">
                          {group.tone === "red" ? `${company.danger_score}点` : `${company.score}点`}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/ranking"
          className="group mt-6 block rounded-3xl border border-green-400/20 bg-gradient-to-br from-green-500/15 to-cyan-500/5 p-6 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-green-300/50 sm:p-8"
        >
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-green-300">
                RANKING PORTAL
              </p>
              <h2 className="mt-3 text-2xl font-black sm:text-3xl">
                決算ランキングから企業を比べる
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-slate-300">
                財務スコア、成長性、収益性、営業CF、安全性、リスクシグナルなど、気になる観点からグロース企業を比較できます。
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-green-400 px-5 py-3 font-black text-slate-950 transition group-hover:bg-green-300">
              一覧を見る →
            </span>
          </div>
        </Link>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <RankingCard
            title="総合スコアランキング"
            description="Freeは上位3社まで表示。4位以降はPro限定。"
            href="/ranking/score"
            companies={scoreTop}
            metric="score"
          />
          <RankingCard
            title="売上高ランキング"
            description="Freeは上位3社まで表示。4位以降はPro限定。"
            href="/ranking/revenue"
            companies={revenueTop}
            metric="revenue"
          />
          <RankingCard
            title="営業利益ランキング"
            description="Freeは上位3社まで表示。4位以降はPro限定。"
            href="/ranking/operating-income"
            companies={operatingIncomeTop}
            metric="operatingIncome"
          />
          <RankingCard
            title="営業CFランキング"
            description="Freeは上位3社まで表示。4位以降はPro限定。"
            href="/ranking/operating-cash-flow"
            companies={operatingCFTop}
            metric="operatingCF"
          />
          <div className="lg:col-span-2">
            <RankingCard
              title="リスクシグナルランキング"
              description="Freeは上位3社まで表示。4位以降と内訳詳細はPro限定。"
              href="/ranking/risk-signal"
              companies={dangerTop}
              metric="danger"
            />
          </div>
        </div>

        <section className="mt-6 rounded-3xl border border-yellow-400/25 bg-gradient-to-br from-yellow-500/15 via-white/[0.04] to-orange-500/10 p-5 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.28em] text-yellow-300">PRO RANKINGS</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Proで深掘りするランキング</h2>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                FreeではTOP3まで、Proでは全順位・数値・企業コメントまで確認できます。
              </p>
            </div>
            <span className="w-fit rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-slate-950">
              {isPro ? "Pro利用中" : "初月100円"}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {proRankingLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-yellow-300/20 bg-black/20 p-4 transition hover:-translate-y-0.5 hover:bg-yellow-400/10"
              >
                <p className="font-black text-yellow-100">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                <span className="mt-4 inline-block text-sm font-bold text-yellow-200">見る →</span>
              </Link>
            ))}
          </div>

          {!isPro ? (
            <Link
              href="/pricing"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-yellow-300"
            >
              初月100円で全順位を開放する
            </Link>
          ) : null}
        </section>

        <section className="mt-6 rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-5 backdrop-blur-xl sm:p-7">
          <h2 className="text-2xl font-black sm:text-3xl">
            Proで見えるもの
          </h2>
          <p className="mt-3 leading-8 text-slate-300">
            各ランキングの4位以降、リスクシグナル内訳、AI詳細分析、決算変化速報を初月100円で確認できます。
          </p>
          <Link
            href="/pricing"
            className="mt-5 inline-flex rounded-2xl bg-yellow-400 px-5 py-3 font-black text-slate-950 hover:bg-yellow-300"
          >
            初月100円でProを試す
          </Link>
        </section>

        <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5 backdrop-blur-xl sm:p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.25em] text-cyan-300">GROWTH NEWS</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">グロースニュース</h2>
            </div>
            <Link href="/news" className="text-sm font-bold text-cyan-300 hover:text-cyan-200">
              もっと見る →
            </Link>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {news.length === 0 ? (
              <p className="text-slate-400">ニュースはまだありません。</p>
            ) : (
              news.map((item: NewsItem) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-400/40 hover:bg-white/10"
                >
                  <p className="font-bold leading-7">{item.title}</p>
                  <p className="mt-3 text-sm text-slate-400">{item.source || "Google News"}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatNewsDate(item.published_at)}</p>
                </a>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
