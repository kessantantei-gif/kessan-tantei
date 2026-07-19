import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CompanyRow = {
  ticker: string;
  market_segment: string;
  listing_status: string;
  edinet_code: string | null;
  data_quality: string;
  last_financial_update: string | null;
};

type ImportRun = {
  id: string;
  import_type: string;
  market_segment: string | null;
  status: string;
  source: string;
  started_at: string | null;
  finished_at: string | null;
  total_count: number;
  success_count: number;
  failure_count: number;
  error_summary: string | null;
};

type QualityIssue = {
  id: string;
  severity: string;
  category: string;
  message: string;
  status: string;
  created_at: string;
};

function formatDate(value: string | null) {
  if (!value) return "未実行";
  return new Date(value).toLocaleString("ja-JP");
}

function statusClass(status: string) {
  if (status === "success" || status === "resolved") {
    return "border-green-400/20 bg-green-500/10 text-green-200";
  }
  if (status === "failed" || status === "critical" || status === "error") {
    return "border-red-400/20 bg-red-500/10 text-red-200";
  }
  if (status === "partial" || status === "warning") {
    return "border-yellow-400/20 bg-yellow-500/10 text-yellow-200";
  }
  return "border-white/10 bg-white/5 text-slate-300";
}

export default async function AdminAllMarketsPage() {
  if (!(await isAdminUser())) redirect("/");

  const [companiesResult, analysesResult, importsResult, issuesResult] = await Promise.all([
    supabaseAdmin
      .from("all_market_companies")
      .select(
        "ticker, market_segment, listing_status, edinet_code, data_quality, last_financial_update"
      )
      .limit(10000),
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, market_segment")
      .neq("risk_level", "EXCLUDED")
      .limit(10000),
    supabaseAdmin
      .from("data_import_runs")
      .select(
        "id, import_type, market_segment, status, source, started_at, finished_at, total_count, success_count, failure_count, error_summary"
      )
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("data_quality_issues")
      .select("id, severity, category, message, status, created_at")
      .neq("status", "resolved")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (companiesResult.error) {
    throw new Error(`全市場会社マスタ取得失敗: ${companiesResult.error.message}`);
  }
  if (analysesResult.error) {
    throw new Error(`分析データ取得失敗: ${analysesResult.error.message}`);
  }

  const companies = (companiesResult.data ?? []) as CompanyRow[];
  const analyses = analysesResult.data ?? [];
  const imports = (importsResult.data ?? []) as ImportRun[];
  const issues = (issuesResult.data ?? []) as QualityIssue[];
  const analyzedTickers = new Set(analyses.map((row) => row.ticker));

  const marketStats = ["prime", "standard", "growth"].map((market) => {
    const listed = companies.filter(
      (company) => company.market_segment === market && company.listing_status === "listed"
    );
    const analyzed = listed.filter((company) => analyzedTickers.has(company.ticker));
    const edinetLinked = listed.filter((company) => company.edinet_code).length;
    const warnings = listed.filter((company) =>
      ["warning", "error"].includes(company.data_quality)
    ).length;

    return {
      market,
      listed: listed.length,
      analyzed: analyzed.length,
      edinetLinked,
      warnings,
      coverage: listed.length > 0 ? Math.round((analyzed.length / listed.length) * 100) : 0,
    };
  });

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-bold text-violet-300 hover:text-violet-200">
              ← 管理トップ
            </Link>
            <p className="mt-5 text-xs font-black tracking-[0.3em] text-violet-300">
              ALL MARKETS CONTROL CENTER
            </p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">全市場運用ダッシュボード</h1>
            <p className="mt-4 max-w-4xl leading-8 text-slate-300">
              プライム・スタンダード・グロースの会社マスタ、EDINET紐付け、解析進捗、インポート履歴、品質問題を一画面で確認します。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/markets"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              市場トップを確認
            </Link>
            <Link
              href="/admin/operations"
              className="rounded-full border border-violet-400/20 bg-violet-500/10 px-5 py-3 text-sm font-bold text-violet-200 hover:bg-violet-500/20"
            >
              分析操作へ
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          {marketStats.map((stat) => (
            <div key={stat.market} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">
                {stat.market}
              </p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-4xl font-black">{stat.coverage}%</p>
                  <p className="mt-1 text-sm text-slate-400">解析進捗</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${
                  stat.coverage >= 90
                    ? "border-green-400/20 bg-green-500/10 text-green-200"
                    : "border-yellow-400/20 bg-yellow-500/10 text-yellow-200"
                }`}>
                  {stat.analyzed}/{stat.listed}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <dt className="text-slate-500">EDINET紐付け</dt>
                  <dd className="mt-1 font-black">{stat.edinetLinked}</dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <dt className="text-slate-500">品質警告</dt>
                  <dd className="mt-1 font-black">{stat.warnings}</dd>
                </div>
              </dl>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-2xl font-black">最近のインポート</h2>
            <div className="mt-5 space-y-3">
              {imports.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-slate-400">
                  インポート履歴はありません。
                </p>
              ) : (
                imports.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-black">{run.import_type}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(run.started_at)} → {formatDate(run.finished_at)}
                        </p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">
                      成功 {run.success_count} / 失敗 {run.failure_count} / 対象 {run.total_count}
                    </p>
                    {run.error_summary ? (
                      <p className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs leading-5 text-red-200">
                        {run.error_summary}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black">未解決の品質問題</h2>
              <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-black text-red-200">
                {issues.length}
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {issues.length === 0 ? (
                <p className="rounded-2xl border border-green-400/20 bg-green-500/10 p-4 text-green-200">
                  未解決の品質問題はありません。
                </p>
              ) : (
                issues.map((issue) => (
                  <div key={issue.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black">{issue.category}</p>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(issue.severity)}`}>
                        {issue.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{issue.message}</p>
                    <p className="mt-2 text-xs text-slate-600">{formatDate(issue.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
