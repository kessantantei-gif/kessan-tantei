import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import MetricBadge from "@/components/MetricBadge";
import CompanySearch from "@/components/company-search";
import { isProUser } from "@/lib/pro-engine";

type PageProps = {
  params: Promise<{ type: string }>;
};

type Company = {
  ticker: string;
  company_name: string;
  score: number;
  danger_score: number;
  risk_level: string;
  locked?: boolean;
  financials?: {
    revenue?: number;
    operatingIncome?: number;
    operatingCF?: number;
    revenueGrowth?: number;
    operatingMargin?: number;
    equityRatio?: number;
  } | null;
};

const rankingConfig = {
  score: {
    title: "財務スコアランキング",
    description:
      "成長性・安全性・希薄化リスクを総合評価したランキングです。FreeはSランク上位3社まで表示します。",
    metric: "score",
  },
  "revenue-growth": {
    title: "売上成長率ランキング",
    description: "前期から売上高がどれだけ伸びたかを比較するランキングです。",
    metric: "revenueGrowth",
  },
  "operating-margin": {
    title: "営業利益率ランキング",
    description: "売上高に対して本業の利益をどれだけ残せたかを比較するランキングです。",
    metric: "operatingMargin",
  },
  "operating-cash-flow": {
    title: "営業CFランキング",
    description: "営業活動によるキャッシュ創出力が高い企業のランキングです。",
    metric: "operatingCF",
  },
  "equity-ratio": {
    title: "自己資本比率ランキング",
    description: "総資産に占める自己資本の割合が高い企業のランキングです。",
    metric: "equityRatio",
  },
  "risk-signal": {
    title: "リスクシグナルランキング",
    description: "決算データから注意して確認したい財務シグナルが強い企業のランキングです。",
    metric: "danger",
  },
  revenue: {
    title: "売上高ランキング",
    description: "売上規模が大きいグロース市場企業のランキングです。",
    metric: "revenue",
  },
  "operating-income": {
    title: "営業利益ランキング",
    description: "本業の利益水準が高い企業のランキングです。",
    metric: "operatingIncome",
  },
  "operating-cf": {
    title: "営業CFランキング",
    description: "営業活動によるキャッシュ創出力が高い企業のランキングです。",
    metric: "operatingCF",
  },
  danger: {
    title: "Danger Scoreランキング",
    description: "注意すべき財務シグナルが強い企業のランキングです。内訳詳細はPro限定です。",
    metric: "danger",
  },
} as const;

function yenOku(value: number) {
  return `${(value / 100000000).toFixed(1)}億円`;
}

function metricValue(company: Company, metric: string) {
  if (company.locked) return "＊＊";

  if (metric === "score") return `${company.score}`;
  if (metric === "danger") return `${company.danger_score}`;
  if (metric === "revenueGrowth") return `${company.financials?.revenueGrowth ?? 0}%`;
  if (metric === "operatingMargin") return `${company.financials?.operatingMargin ?? 0}%`;
  if (metric === "equityRatio") return `${company.financials?.equityRatio ?? 0}%`;
  if (metric === "revenue") return yenOku(company.financials?.revenue ?? 0);
  if (metric === "operatingIncome") return yenOku(company.financials?.operatingIncome ?? 0);
  return yenOku(company.financials?.operatingCF ?? 0);
}

function metricLabel(metric: string) {
  if (metric === "score") return "Score";
  if (metric === "danger") return "リスク";
  if (metric === "revenueGrowth") return "売上成長率";
  if (metric === "operatingMargin") return "営業利益率";
  if (metric === "equityRatio") return "自己資本比率";
  if (metric === "revenue") return "売上高";
  if (metric === "operatingIncome") return "営業利益";
  return "営業CF";
}

function metricTone(metric: string, locked?: boolean) {
  if (locked) return "yellow" as const;
  if (metric === "danger") return "red" as const;
  if (metric === "score") return "green" as const;
  if (metric === "operatingCF") return "cyan" as const;
  if (metric === "operatingIncome") return "yellow" as const;
  return "slate" as const;
}

function sortCompanies(companies: Company[], metric: string) {
  const getter = (company: Company) => {
    if (metric === "score") return company.score;
    if (metric === "danger") return company.danger_score;
    if (metric === "revenueGrowth") return company.financials?.revenueGrowth ?? 0;
    if (metric === "operatingMargin") return company.financials?.operatingMargin ?? 0;
    if (metric === "equityRatio") return company.financials?.equityRatio ?? 0;
    if (metric === "revenue") return company.financials?.revenue ?? 0;
    if (metric === "operatingIncome") return company.financials?.operatingIncome ?? 0;
    return company.financials?.operatingCF ?? 0;
  };

  return [...companies]
    .filter((company) => company.risk_level !== "EXCLUDED")
    .filter((company) => metric === "score" || metric === "danger" || getter(company) !== 0)
    .sort((a, b) => getter(b) - getter(a));
}

function applySRankLock(companies: Company[], type: string, isPro: boolean) {
  if (isPro || type !== "score") return companies;

  return companies.map((company, index) => {
    if (index < 3) return company;

    return {
      ...company,
      locked: true,
    };
  });
}

export default async function RankingPage({ params }: PageProps) {
  const { type } = await params;
  const config = rankingConfig[type as keyof typeof rankingConfig];

  if (!config) {
    notFound();
  }

  const isPro = await isProUser();

  const { data } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, risk_level, financials")
    .neq("risk_level", "EXCLUDED")
    .limit(1000);

  const allCompanies = (data ?? []) as Company[];
  const sortedCompanies = sortCompanies(allCompanies, config.metric);
  const companies = applySRankLock(sortedCompanies, type, isPro);

  const searchCompanies = allCompanies
    .filter((company) => company.risk_level !== "EXCLUDED")
    .map((company) => ({
      ticker: company.ticker,
      company_name: company.company_name,
      score: company.score,
      danger_score: company.danger_score,
    }));

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_bottom,_rgba(168,85,247,0.12),transparent_35%)]" />

      <header className="relative z-10 border-b border-white/10 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
          <Link href="/" className="text-2xl font-black sm:text-3xl">
            決算探偵
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            ← ホームへ
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-8">
          <p className="text-xs tracking-[0.3em] text-green-300">
            GROWTH MARKET RANKING
          </p>
          <h1 className="mt-4 text-3xl font-black sm:text-5xl">{config.title}</h1>
          <p className="mt-4 max-w-3xl leading-8 text-slate-300">{config.description}</p>

          {type === "score" && !isPro ? (
            <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-4 text-sm leading-7 text-yellow-200">
              FreeではSランク上位3社まで表示しています。4社目以降のSランク銘柄はPro限定です。
              <div className="mt-3">
                <Link
                  href="/pricing"
                  className="inline-flex rounded-xl bg-yellow-400 px-4 py-2 font-black text-slate-950 hover:bg-yellow-300"
                >
                  初月100円で全Sランクを見る
                </Link>
              </div>
            </div>
          ) : null}

          <div className="mt-6 max-w-3xl">
            <CompanySearch companies={searchCompanies} />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {companies.map((company, index) => {
            if (company.locked) {
              return (
                <Link
                  key={`${company.ticker}-locked-${index}`}
                  href="/pricing"
                  className="grid gap-4 rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-4 transition hover:border-yellow-300/50 hover:bg-yellow-500/20 sm:p-5 md:grid-cols-[70px_1fr_150px_140px]"
                >
                  <div className="flex items-center">
                    <p className="text-3xl font-black text-yellow-300">#{index + 1}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-xl font-black text-yellow-300 sm:text-2xl">
                      Pro限定 Sランク銘柄
                    </p>
                    <p className="mt-1 text-sm text-yellow-200">
                      初月100円で銘柄名・スコアを表示
                    </p>
                  </div>

                  <MetricBadge label="Score" value="＊＊" tone="yellow" />
                  <MetricBadge label="Danger" value="＊＊" tone="yellow" />
                </Link>
              );
            }

            return (
              <Link
                key={company.ticker}
                href={`/company/${company.ticker}`}
                className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-green-400/40 hover:bg-white/10 sm:p-5 md:grid-cols-[70px_1fr_150px_140px]"
              >
                <div className="flex items-center">
                  <p className="text-3xl font-black text-slate-500">#{index + 1}</p>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-xl font-black sm:text-2xl">
                    {company.company_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{company.ticker}</p>
                </div>

                <MetricBadge
                  label={metricLabel(config.metric)}
                  value={metricValue(company, config.metric)}
                  tone={metricTone(config.metric)}
                />

                <MetricBadge
                  label="Danger"
                  value={`${company.danger_score}`}
                  tone="red"
                />
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
