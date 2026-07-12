import type { Metadata } from "next";
import UpdatesDashboardClient from "@/components/updates-dashboard-client";
import { isProUser } from "@/lib/pro-engine";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "決算更新一覧・最近見た企業 | 決算探偵",
  description:
    "グロース市場の決算更新、ウォッチ中企業の更新、最近見た企業をまとめて確認できます。",
  alternates: { canonical: "/updates" },
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default async function UpdatesPage() {
  const [{ data }, isPro] = await Promise.all([
    supabaseAdmin
      .from("company_analyses")
      .select(
        "ticker, company_name, score, danger_score, financials, updated_at, created_at, risk_level"
      )
      .neq("risk_level", "EXCLUDED")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(120),
    isProUser(),
  ]);

  const updates = (data ?? []).map((company) => ({
    ticker: company.ticker,
    companyName: company.company_name,
    score: num(company.score),
    dangerScore: num(company.danger_score),
    revenueGrowth: num(company.financials?.revenueGrowth),
    operatingMargin: num(company.financials?.operatingMargin),
    operatingCFMargin: num(
      company.financials?.operatingCFMargin ?? company.financials?.ocfMargin
    ),
    updatedAt: company.updated_at ?? company.created_at ?? null,
  }));

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-9">
          <p className="text-xs font-black tracking-[0.3em] text-green-300">
            RETURN DASHBOARD
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">
            今日の決算更新を確認
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate-300 sm:text-base">
            新しく更新された企業、ウォッチ中の企業、最近見た企業を一画面にまとめています。
          </p>
        </header>

        <UpdatesDashboardClient updates={updates} isPro={isPro} />
      </div>
    </main>
  );
}
