import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "銘柄比較 | 決算探偵",
  description:
    "決算探偵の銘柄比較ページです。複数企業の財務スコア、成長率、利益率、安全性指標を横並びで確認できます。",
};

type PageProps = {
  searchParams: Promise<{ tickers?: string }>;
};

type Company = {
  ticker: string;
  company_name: string;
  score: number | null;
  danger_score: number | null;
  risk_level: string | null;
  financials: Record<string, number | null | undefined> | null;
};

function parseTickers(value?: string) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 5)
    )
  );
}

function pct(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function num(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

function riskLabel(level?: string | null) {
  if (level === "REJECT") return "対象外";
  if (level === "DANGEROUS") return "危険";
  if (level === "WARNING") return "警戒";
  if (level === "WATCH") return "要観察";
  return "安全";
}

function cellTone(value?: number | null, reverse = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-500";
  const good = reverse ? value <= 30 : value >= 30;
  const warn = reverse ? value <= 60 : value >= 0;
  if (good) return "text-green-200";
  if (warn) return "text-yellow-200";
  return "text-red-200";
}

const rows = [
  {
    label: "総合スコア",
    get: (company: Company) => num(company.score),
    tone: (company: Company) => cellTone(company.score),
  },
  {
    label: "Danger Score",
    get: (company: Company) => num(company.danger_score),
    tone: (company: Company) => cellTone(company.danger_score, true),
  },
  {
    label: "リスク区分",
    get: (company: Company) => riskLabel(company.risk_level),
    tone: () => "text-slate-100",
  },
  {
    label: "売上成長率",
    get: (company: Company) => pct(company.financials?.revenueGrowth),
    tone: (company: Company) => cellTone(company.financials?.revenueGrowth),
  },
  {
    label: "売上総利益成長率",
    get: (company: Company) => pct(company.financials?.grossProfitGrowth),
    tone: (company: Company) => cellTone(company.financials?.grossProfitGrowth),
  },
  {
    label: "営業利益率",
    get: (company: Company) => pct(company.financials?.operatingMargin),
    tone: (company: Company) => cellTone(company.financials?.operatingMargin),
  },
  {
    label: "営業CF率",
    get: (company: Company) => pct(company.financials?.operatingCFMargin),
    tone: (company: Company) => cellTone(company.financials?.operatingCFMargin),
  },
  {
    label: "自己資本比率",
    get: (company: Company) => pct(company.financials?.equityRatio),
    tone: (company: Company) => cellTone(company.financials?.equityRatio),
  },
];

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tickers = parseTickers(params.tickers);

  const { data } = tickers.length
    ? await supabaseAdmin
        .from("company_analyses")
        .select("ticker, company_name, score, danger_score, risk_level, financials")
        .in("ticker", tickers)
    : { data: [] as Company[] };

  const companies = [...((data ?? []) as Company[])].sort(
    (a, b) => tickers.indexOf(a.ticker) - tickers.indexOf(b.ticker)
  );

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.14),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),transparent_30%)]" />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.28em] text-slate-500">COMPARE</p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">銘柄比較</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              複数企業の財務スコアと主要指標を横並びで確認できます。買い・売り等の投資判断を示すものではありません。
            </p>
          </div>

          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/10"
          >
            ランキングへ戻る
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
          <p className="text-sm font-bold text-slate-300">使い方</p>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            URLに <span className="font-mono text-cyan-200">/compare?tickers=4478,7048,4881</span> のように指定してください。最大5社まで比較できます。
          </p>
        </div>

        {tickers.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-yellow-300/20 bg-yellow-500/10 p-6 text-yellow-100">
            比較したい証券コードを指定してください。
          </div>
        ) : companies.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-red-300/20 bg-red-500/10 p-6 text-red-100">
            指定された銘柄が見つかりませんでした。
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/20 shadow-2xl shadow-black/30">
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.04]">
                    <th className="sticky left-0 z-10 bg-[#101423] px-4 py-4 text-xs font-black tracking-[0.18em] text-slate-400">
                      指標
                    </th>
                    {companies.map((company) => (
                      <th key={company.ticker} className="px-4 py-4 align-top">
                        <Link href={`/company/${company.ticker}`} className="group block">
                          <p className="text-lg font-black text-white group-hover:text-cyan-200">
                            {company.company_name}
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-500">{company.ticker}</p>
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className="border-b border-white/10 last:border-b-0">
                      <th className="sticky left-0 z-10 bg-[#101423] px-4 py-4 text-sm font-black text-slate-300">
                        {row.label}
                      </th>
                      {companies.map((company) => (
                        <td key={`${company.ticker}-${row.label}`} className={`px-4 py-4 text-lg font-black ${row.tone(company)}`}>
                          {row.get(company)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
