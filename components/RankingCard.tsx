import Link from "next/link";
import MetricBadge from "@/components/MetricBadge";

export type RankingCompany = {
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
  } | null;
};

type RankingCardProps = {
  title: string;
  description: string;
  href: string;
  companies: RankingCompany[];
  metric: "score" | "revenue" | "operatingIncome" | "operatingCF" | "danger";
};

function yenOku(value: number) {
  return `${(value / 100000000).toFixed(1)}億円`;
}

function metricValue(company: RankingCompany, metric: RankingCardProps["metric"]) {
  if (company.locked) return "＊＊";

  if (metric === "score") return `${company.score}`;
  if (metric === "danger") return `${company.danger_score}`;
  if (metric === "revenue") return yenOku(company.financials?.revenue ?? 0);
  if (metric === "operatingIncome") return yenOku(company.financials?.operatingIncome ?? 0);
  return yenOku(company.financials?.operatingCF ?? 0);
}

function metricLabel(metric: RankingCardProps["metric"]) {
  if (metric === "score") return "Score";
  if (metric === "danger") return "Danger";
  if (metric === "revenue") return "売上高";
  if (metric === "operatingIncome") return "営業利益";
  return "営業CF";
}

function metricTone(metric: RankingCardProps["metric"]) {
  if (metric === "danger") return "red" as const;
  if (metric === "score") return "green" as const;
  if (metric === "operatingCF") return "cyan" as const;
  if (metric === "operatingIncome") return "yellow" as const;
  return "slate" as const;
}

export default function RankingCard({
  title,
  description,
  href,
  companies,
  metric,
}: RankingCardProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black sm:text-2xl">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>

        <Link
          href={href}
          className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-slate-300 hover:border-green-400/40 hover:text-white"
        >
          もっと見る
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {companies.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
            表示できる銘柄がありません。
          </p>
        ) : (
          companies.map((company, index) => {
            const content = (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg font-black text-slate-300">
                  {index + 1}
                </div>

                <div className="min-w-0">
                  {company.locked ? (
                    <>
                      <p className="truncate font-black text-yellow-300">
                        Pro限定 Sランク銘柄
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        初月100円で全Sランクを表示
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="truncate font-black">{company.company_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{company.ticker}</p>
                    </>
                  )}
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <MetricBadge
                    label={metricLabel(metric)}
                    value={metricValue(company, metric)}
                    tone={company.locked ? "yellow" : metricTone(metric)}
                  />
                </div>
              </>
            );

            if (company.locked) {
              return (
                <Link
                  key={`${company.ticker}-locked`}
                  href="/pricing"
                  className="grid grid-cols-[42px_1fr] gap-3 rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-4 transition hover:border-yellow-300/50 hover:bg-yellow-500/20 sm:grid-cols-[50px_1fr_130px]"
                >
                  {content}
                </Link>
              );
            }

            return (
              <Link
                key={company.ticker}
                href={`/company/${company.ticker}`}
                className="grid grid-cols-[42px_1fr] gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-green-400/40 hover:bg-white/10 sm:grid-cols-[50px_1fr_130px]"
              >
                {content}
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}