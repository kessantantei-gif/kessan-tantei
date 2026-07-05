import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "データ品質 | 決算探偵",
  description:
    "決算探偵のデータ品質ページです。対象企業数、決算期データの取得状況、補正状況、注意対象を確認できます。",
};

type HistoryRow = {
  year?: string | number;
  fiscalYear?: string | number;
  fiscalMonth?: string | number;
  fiscalPeriod?: string;
  fiscal_period?: string;
  period?: string;
};

type Company = {
  ticker: string;
  company_name: string;
  doc_id: string | null;
  history: HistoryRow[] | null;
  updated_at?: string | null;
};

function rowYear(row: HistoryRow) {
  const value = Number(row.fiscalYear ?? row.year);
  return Number.isFinite(value) ? value : null;
}

function rowMonth(row: HistoryRow) {
  const value = Number(row.fiscalMonth);
  return Number.isFinite(value) ? value : null;
}

function periodText(row: HistoryRow) {
  return row.fiscalPeriod ?? row.fiscal_period ?? row.period ?? "";
}

function isForeignOrJdr(company: Company) {
  return (
    company.company_name.includes("ＪＤＲ") ||
    company.company_name.includes("リミテッド") ||
    company.company_name.toLowerCase().includes("limited")
  );
}

function hasFiscalGap(company: Company) {
  const years = (company.history ?? [])
    .map(rowYear)
    .filter((year): year is number => year !== null)
    .sort((a, b) => a - b);

  if (years.length < 2) return false;

  for (let i = 1; i < years.length; i += 1) {
    if (years[i] - years[i - 1] > 1) return true;
  }

  return false;
}

function hasMissingPeriod(company: Company) {
  return (company.history ?? []).some((row) => !periodText(row) || !rowMonth(row));
}

function hasDuplicateYear(company: Company) {
  const years = (company.history ?? [])
    .map(rowYear)
    .filter((year): year is number => year !== null);
  return new Set(years).size !== years.length;
}

function hasTooManyPeriods(company: Company) {
  return (company.history ?? []).length > 3;
}

function latestUpdatedAt(companies: Company[]) {
  const timestamps = companies
    .map((company) => company.updated_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (timestamps.length === 0) return "不明";

  return new Date(Math.max(...timestamps)).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20">
      <p className="text-xs font-bold tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-black text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{note}</p>
    </div>
  );
}

export default async function DataQualityPage() {
  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, doc_id, history, updated_at")
    .order("ticker", { ascending: true });

  if (error) throw error;

  const companies = (data ?? []) as Company[];
  const foreignOrJdr = companies.filter(isForeignOrJdr);
  const domestic = companies.filter((company) => !isForeignOrJdr(company));

  const domesticMissing = domestic.filter(hasMissingPeriod);
  const duplicateYears = domestic.filter(hasDuplicateYear);
  const tooManyPeriods = domestic.filter(hasTooManyPeriods);
  const fiscalGap = domestic.filter(hasFiscalGap);
  const normalDomestic = domestic.filter(
    (company) =>
      !hasMissingPeriod(company) &&
      !hasDuplicateYear(company) &&
      !hasTooManyPeriods(company)
  );

  const warnings = fiscalGap;
  const errorCompanies = domestic.filter(
    (company) => hasMissingPeriod(company) || hasDuplicateYear(company) || hasTooManyPeriods(company)
  );

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.14),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),transparent_30%)]" />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.28em] text-slate-500">DATA QUALITY</p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">データ品質</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
              EDINET等から取得した財務データの整備状況です。決算期・決算月・年度重複・表示対象期間を監査し、異常値を減らすための補正を行っています。
            </p>
          </div>

          <Link
            href="/ranking"
            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/10"
          >
            ランキングへ戻る
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-5 text-sm leading-7 text-cyan-50 sm:p-6">
          最終更新目安：<span className="font-black">{latestUpdatedAt(companies)}</span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="対象企業" value={companies.length} note="グロース市場を中心に集計対象としている企業数です。" />
          <StatCard label="国内通常企業 正常" value={normalDomestic.length} note="決算期・決算月・年度重複・3期超表示に問題がない企業です。" />
          <StatCard label="ERROR" value={errorCompanies.length} note="国内通常企業で修正が必要なデータ件数です。" />
          <StatCard label="WARNING" value={warnings.length} note="年度飛びなど、比較期間に注意が必要な企業です。" />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="決算期欠落" value={domesticMissing.length} note="国内通常企業で決算期または決算月が不足している企業数です。" />
          <StatCard label="年度重複" value={duplicateYears.length} note="同じ年度が複数行ある企業数です。" />
          <StatCard label="3期超表示" value={tooManyPeriods.length} note="表示対象が3期を超えている企業数です。" />
          <StatCard label="JDR/外国会社" value={foreignOrJdr.length} note="タグ体系が異なるため別管理としている企業数です。" />
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-xl font-black text-white">データ判定ルール</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
              <p className="font-black text-red-100">ERROR</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">年度重複、決算期欠落、3期超表示など、修正が必要な状態。</p>
            </div>
            <div className="rounded-2xl border border-yellow-300/20 bg-yellow-500/10 p-4">
              <p className="font-black text-yellow-100">WARNING</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">年度飛びなど、成長率の比較期間に注意が必要な状態。</p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
              <p className="font-black text-cyan-100">INFO</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">JDR・外国会社など、通常の国内企業とは別扱いする状態。</p>
            </div>
          </div>
        </div>

        {warnings.length > 0 ? (
          <div className="mt-8 rounded-3xl border border-yellow-300/20 bg-yellow-500/10 p-5 sm:p-6">
            <h2 className="text-xl font-black text-yellow-100">比較期間に注意が必要な企業</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              年度が連続していないため、成長率を見る際は会社ページの推移表も確認してください。
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {warnings.slice(0, 18).map((company) => (
                <Link
                  key={company.ticker}
                  href={`/company/${company.ticker}`}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-slate-100 hover:bg-white/10"
                >
                  {company.ticker} {company.company_name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5 text-xs leading-6 text-slate-500">
          本ページはデータ取得・加工状況の透明性を高めるためのものです。表示内容は投資判断を示すものではなく、買い・売り等の投資助言ではありません。
        </p>
      </section>
    </main>
  );
}
