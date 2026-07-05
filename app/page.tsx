import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import RankingCard, { type RankingCompany } from "@/components/RankingCard";
import CompanySearch from "@/components/company-search";
import {
  FREE_VISIBLE_S_RANK_LIMIT,
  isProUser,
} from "@/lib/pro-engine";

type NewsItem = {
  id: string | number;
  ticker?: string | null;
  title: string;
  url: string;
  source?: string | null;
  published_at?: string | null;
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

function applySRankLock(companies: RankingCompany[], isPro: boolean) {
  if (isPro) return companies;

  return companies.map((company, index) => {
    if (index < FREE_VISIBLE_S_RANK_LIMIT) return company;

    return {
      ...company,
      locked: true,
    };
  });
}

async function loadCompanies() {
  const { data } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, risk_level, financials")
    .neq("risk_level", "EXCLUDED")
    .limit(1000);

  return ((data ?? []) as RankingCompany[]).filter(isActiveCompany);
}

async function loadNews() {
  const { data } = await supabaseAdmin
    .from("growth_news")
    .select("id, ticker, title, summary, url, source, published_at, created_at")
    .not("url", "is", null)
    .order("published_at", { ascending: false })
    .limit(3);

  return data ?? [];
}

export default async function HomePage() {
  const companies = await loadCompanies();
  const news = await loadNews();
  const isPro = await isProUser();

  const searchCompanies = companies.map((company) => ({
    ticker: company.ticker,
    company_name: company.company_name,
    score: company.score,
    danger_score: company.danger_score,
  }));

  const scoreTopRaw = [...companies].sort(byNumber((c) => c.score)).slice(0, 5);
  const scoreTop = applySRankLock(scoreTopRaw, isPro);

  const revenueTop = [...companies]
    .filter((c) => (c.financials?.revenue ?? 0) > 0)
    .sort(byNumber((c) => c.financials?.revenue ?? 0))
    .slice(0, 5);

  const operatingIncomeTop = [...companies]
    .filter((c) => (c.financials?.operatingIncome ?? 0) !== 0)
    .sort(byNumber((c) => c.financials?.operatingIncome ?? 0))
    .slice(0, 5);

  const operatingCFTop = [...companies]
    .filter((c) => (c.financials?.operatingCF ?? 0) !== 0)
    .sort(byNumber((c) => c.financials?.operatingCF ?? 0))
    .slice(0, 5);

  const dangerTop = [...companies]
    .sort(byNumber((c) => c.danger_score))
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_bottom,_rgba(168,85,247,0.12),transparent_35%)]" />

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
            決算探偵は、グロース市場に特化した財務分析ダッシュボードです。
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
              <p className="mt-2 text-2xl font-black">Sランク全件</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-5">
              <p className="text-sm text-cyan-300">自動更新</p>
              <p className="mt-2 text-2xl font-black">EDINET連携</p>
            </div>
          </div>
        </div>

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
            description="グロース市場の中で売上規模が大きい企業。"
            href="/ranking/revenue"
            companies={revenueTop}
            metric="revenue"
          />
          <RankingCard
            title="営業利益ランキング"
            description="本業の利益水準が高い企業。"
            href="/ranking/operating-income"
            companies={operatingIncomeTop}
            metric="operatingIncome"
          />
          <RankingCard
            title="営業CFランキング"
            description="現金創出力が強い企業。"
            href="/ranking/operating-cash-flow"
            companies={operatingCFTop}
            metric="operatingCF"
          />
          <div className="lg:col-span-2">
            <RankingCard
              title="リスクシグナルランキング"
              description="財務リスクや注意シグナルが強い企業。内訳詳細はPro限定。"
              href="/ranking/risk-signal"
              companies={dangerTop}
              metric="danger"
            />
          </div>
        </div>

        <section className="mt-6 rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-5 backdrop-blur-xl sm:p-7">
          <h2 className="text-2xl font-black sm:text-3xl">
            Proで見えるもの
          </h2>
          <p className="mt-3 leading-8 text-slate-300">
            Sランク全件、リスクシグナル内訳、AI詳細分析、決算変化速報を初月100円で確認できます。
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
              (news as NewsItem[]).map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-400/40 hover:bg-white/10"
                >
                  <p className="font-black leading-7">{item.title}</p>

                  <div className="mt-2 text-xs text-slate-400">
                    <p>
                      {item.source || "Google News"}
                      {item.ticker ? ` / ${item.ticker}` : ""}
                    </p>
                    <p className="mt-1 text-slate-500">
                      発行日: {formatNewsDate(item.published_at)}
                    </p>
                  </div>
                </a>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
