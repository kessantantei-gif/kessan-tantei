import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/clerk-server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateLabels } from "@/lib/label-engine";
import { generateFinancialInsight } from "@/lib/financial-insight-engine";
import { getCompanyNews, summarizeComments } from "@/lib/news-engine";
import {
  canViewAiAnalysis,
  consumeFreeAiUseIfNeeded,
} from "@/lib/pro-engine";
import ProLock from "@/components/pro-lock";
import XShareButton from "@/components/x-share-button";
import CompanyBoard, { type BoardComment } from "@/components/company-board";
import CompanyNewsCarousel from "@/components/company-news-carousel";
import FeedbackButton from "@/components/feedback-button";
import CompanyIndexPlaceholder from "@/components/company-index-placeholder";
import FinancialInsightPanel from "@/components/financial-insight-panel";
import {
  CompanyEarningsChange,
  CompanyFinancialTrends,
} from "@/components/company-quarterly-panels";
import type { QuarterlyFinancialRow } from "@/lib/quarterly-financials";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export const dynamic = "force-dynamic";

type Comment = {
  id: string;
  ticker: string;
  nickname: string;
  body: string;
  created_at: string;
  clerk_user_id?: string | null;
  reply_to_id?: string | null;
  deleted_at?: string | null;
  likeCount: number;
  reportCount: number;
  likedByMe: boolean;
  reportedByMe: boolean;
};

type Reaction = {
  comment_id: string;
  reaction_type: "like" | "report";
  clerk_user_id?: string | null;
};

function yenOku(value: number) {
  return `${(value / 100000000).toFixed(2)} 億円`;
}

function riskColor(level: string) {
  if (level === "REJECT") return "from-purple-500 to-purple-700";
  if (level === "DANGEROUS") return "from-red-500 to-red-700";
  if (level === "WARNING") return "from-orange-400 to-orange-600";
  if (level === "WATCH") return "from-yellow-400 to-yellow-600";
  return "from-green-400 to-emerald-600";
}

function labelClass(tone: "good" | "watch" | "danger" | "neutral") {
  if (tone === "good") return "border-green-400/30 bg-green-500/10 text-green-300";
  if (tone === "watch") return "border-yellow-400/30 bg-yellow-500/10 text-yellow-300";
  if (tone === "danger") return "border-red-400/30 bg-red-500/10 text-red-300";
  return "border-white/10 bg-white/10 text-slate-300";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;

  const [{ data: analysis }, { data: master }] = await Promise.all([
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, company_name, score, danger_score")
      .eq("ticker", ticker)
      .maybeSingle(),
    supabaseAdmin
      .from("all_market_companies")
      .select("ticker, company_name, market_segment, industry_name, listing_status")
      .eq("ticker", ticker)
      .eq("listing_status", "listed")
      .maybeSingle(),
  ]);

  const companyName = analysis?.company_name ?? master?.company_name;
  const title = companyName
    ? `${companyName} (${ticker})の決算・財務分析 | 決算探偵`
    : `${ticker}の決算・財務分析 | 決算探偵`;

  const description = analysis
    ? `${companyName}（${ticker}）のFinancial Score、Danger Score、売上・利益・営業CF、決算変化と警戒シグナルを同一基準で確認できます。`
    : master
      ? `${companyName}（証券コード：${ticker}）の上場市場、業種、直近開示と決算・財務データを確認できます。`
      : `証券コード${ticker}の決算・財務分析ページです。`;

  return {
    title,
    description,
    alternates: {
      canonical: `/company/${ticker}`,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: `https://kessan-tantei.jp/company/${ticker}`,
      siteName: "決算探偵",
      locale: "ja_JP",
      type: "website",
      images: [
        {
          url: "https://kessan-tantei.jp/og-image-all-markets.png",
          width: 1200,
          height: 630,
          alt: "決算探偵",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["https://kessan-tantei.jp/og-image-all-markets.png"],
    },
  };
}

export default async function CompanyPage({ params }: PageProps) {
  const { ticker } = await params;

  const { data: master, error: masterError } = await supabaseAdmin
    .from("all_market_companies")
    .select("ticker, company_name, market_segment, industry_name, listing_status")
    .eq("ticker", ticker)
    .eq("listing_status", "listed")
    .maybeSingle();

  const { data, error: analysisError } = await supabaseAdmin
    .from("company_analyses")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();

  if (!data) {
    if (master) {
      return (
        <CompanyIndexPlaceholder
          ticker={master.ticker}
          companyName={master.company_name}
          marketSegment={master.market_segment}
          industryName={master.industry_name}
        />
      );
    }

    if (masterError || analysisError) {
      throw new Error(
        `企業ページデータ取得失敗 (${ticker}): ${analysisError?.message ?? masterError?.message ?? "unknown error"}`
      );
    }

    notFound();
  }

  const { userId } = await auth();
  const isLoggedIn = Boolean(userId);

  const detailPermission = await canViewAiAnalysis();

  if (detailPermission.allowed && !detailPermission.isPro) {
    await consumeFreeAiUseIfNeeded();
  }

  const { data: commentsData } = await supabaseAdmin
    .from("company_comments")
    .select("id, ticker, nickname, body, created_at, clerk_user_id, reply_to_id, deleted_at")
    .eq("ticker", ticker)
    .order("created_at", { ascending: false })
    .limit(50);

  const rawComments = commentsData ?? [];
  const commentIds = rawComments.map((comment) => comment.id);

  const { data: reactionsData } =
    commentIds.length > 0
      ? await supabaseAdmin
          .from("company_comment_reactions")
          .select("comment_id, reaction_type, clerk_user_id")
          .in("comment_id", commentIds)
      : { data: [] as Reaction[] };

  const reactionCounts = new Map<string, { like: number; report: number }>();
  const myReactions = new Set<string>();

  for (const reaction of (reactionsData ?? []) as Reaction[]) {
    const current = reactionCounts.get(reaction.comment_id) ?? {
      like: 0,
      report: 0,
    };

    if (reaction.reaction_type === "like") current.like += 1;
    if (reaction.reaction_type === "report") current.report += 1;

    if (userId && reaction.clerk_user_id === userId) {
      myReactions.add(`${reaction.comment_id}:${reaction.reaction_type}`);
    }

    reactionCounts.set(reaction.comment_id, current);
  }

  const comments = rawComments.map((comment) => {
    const counts = reactionCounts.get(comment.id) ?? { like: 0, report: 0 };

    return {
      ...comment,
      likeCount: counts.like,
      reportCount: counts.report,
      likedByMe: myReactions.has(`${comment.id}:like`),
      reportedByMe: myReactions.has(`${comment.id}:report`),
    };
  }) as Comment[];

  const boardSummary = summarizeComments(
    comments.filter((comment) => !comment.deleted_at)
  );

  const companyNews = await getCompanyNews(ticker, 5);

  const { data: latestDisclosure } = await supabaseAdmin
    .from("company_disclosures")
    .select("title, disclosed_at, document_type, source_url, xbrl_url, pdf_url")
    .eq("ticker", ticker)
    .order("disclosed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: quarterlyRows } = await supabaseAdmin
    .from("company_quarterly_financials")
    .select(
      "fiscal_year, fiscal_period_end, quarter, cumulative, revenue, operating_income, ordinary_income, profit_attributable_to_owners, operating_cf, created_at, disclosure_id, company_disclosures(source, source_url, disclosed_at, is_correction)"
    )
    .eq("ticker", ticker)
    .order("fiscal_period_end", { ascending: true })
    .order("quarter", { ascending: true });

  const quarterlyHistory: QuarterlyFinancialRow[] = (quarterlyRows ?? []).map((row: any) => {
    const disclosure = Array.isArray(row.company_disclosures)
      ? row.company_disclosures[0]
      : row.company_disclosures;
    return {
      fiscalYear: row.fiscal_year,
      fiscalPeriodEnd: row.fiscal_period_end,
      quarter: row.quarter,
      cumulative: row.cumulative,
      revenue: row.revenue,
      operatingIncome: row.operating_income,
      ordinaryIncome: row.ordinary_income,
      profitAttributableToOwners: row.profit_attributable_to_owners,
      operatingCF: row.operating_cf,
      disclosedAt: disclosure?.disclosed_at ?? row.created_at,
      source: disclosure?.source ?? "tdnet",
      sourceUrl: disclosure?.source_url ?? null,
      isCorrection: disclosure?.is_correction ?? false,
    };
  });

  const latestDisclosureHref =
    latestDisclosure?.pdf_url ??
    latestDisclosure?.xbrl_url ??
    latestDisclosure?.source_url ??
    null;
  const latestDisclosureDate = latestDisclosure?.disclosed_at
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(latestDisclosure.disclosed_at))
    : null;

  const financials = data.financials ?? {};
  const risk = data.risk ?? {
    flags: [],
    riskLevel: data.risk_level,
    dangerScore: data.danger_score,
  };

  const history = data.history ?? [];
  const scoreBreakdown = data.score_breakdown ?? {
    growth: 0,
    quality: 0,
    safety: 0,
  };

  const canShowProDetail = detailPermission.isPro;

  const financialInsight = generateFinancialInsight({
    score: data.score ?? 0,
    dangerScore: data.danger_score ?? 0,
    riskLevel: data.risk_level ?? "SAFE",
    revenue: financials.revenue ?? null,
    revenueGrowth: financials.revenueGrowth ?? null,
    operatingIncome: financials.operatingIncome ?? null,
    operatingMargin: financials.operatingMargin ?? null,
    operatingCF: financials.operatingCF ?? null,
    operatingCFMargin: financials.operatingCFMargin ?? null,
    equityRatio: financials.equityRatio ?? null,
    flags: risk.flags ?? [],
  });

  const labels = generateLabels({
    score: data.score ?? 0,
    dangerScore: data.danger_score ?? 0,
    riskLevel: data.risk_level ?? "SAFE",
    revenue: financials.revenue ?? 0,
    operatingIncome: financials.operatingIncome ?? 0,
    operatingCF: financials.operatingCF ?? 0,
    flags: risk.flags ?? [],
  });

  return (
    <main className="min-h-screen bg-[#050816] text-white" data-company-page="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_bottom,_rgba(168,85,247,0.12),transparent_35%)]" />

      <header className="relative z-10 border-b border-white/10 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
          <Link href="/" className="text-2xl font-black tracking-tight sm:text-3xl">
            決算探偵
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-white sm:text-base">
            ← ランキング
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-3 py-4 sm:px-8 sm:py-8">
        <div
          data-company-section="overview"
          className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,420px)] lg:gap-5"
        >
          <div className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-black tracking-[0.24em] text-cyan-300 sm:text-sm">
                  FINANCIAL SIGNALS / OFFICIAL DISCLOSURES
                </p>

                <h1 className="mt-3 max-w-full text-2xl font-black leading-tight sm:text-5xl">
                  {data.company_name}
                </h1>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                <XShareButton
                  companyName={data.company_name}
                  ticker={data.ticker}
                  score={data.score ?? 0}
                  dangerScore={data.danger_score ?? 0}
                  riskLabel={financialInsight.verdict}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300 sm:px-4 sm:text-sm">
                TSE: {data.ticker}
              </span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200 sm:px-4 sm:text-sm">
                公式開示ベース
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {labels.map((label) => (
                <span
                  key={label.title}
                  className={`rounded-full border px-3 py-1 text-xs font-bold sm:text-sm ${labelClass(label.tone)}`}
                >
                  {label.title}
                </span>
              ))}
            </div>

            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-3">
              <Metric label="売上高" value={yenOku(financials.revenue ?? 0)} />
              <Metric label="営業利益" value={yenOku(financials.operatingIncome ?? 0)} />
              <Metric label="営業CF" value={yenOku(financials.operatingCF ?? 0)} />
            </div>

            {[
              financials.revenueGrowth,
              financials.operatingMargin,
              financials.operatingCFMargin,
              financials.equityRatio,
              financials.totalAssetTurnover,
            ].some((value) => typeof value === "number") ? (
              <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {typeof financials.revenueGrowth === "number" ? (
                  <Metric label="売上成長率" value={`${financials.revenueGrowth.toFixed(1)}%`} />
                ) : null}
                {typeof financials.operatingMargin === "number" ? (
                  <Metric label="営業利益率" value={`${financials.operatingMargin.toFixed(1)}%`} />
                ) : null}
                {typeof financials.operatingCFMargin === "number" ? (
                  <Metric label="営業CF率" value={`${financials.operatingCFMargin.toFixed(1)}%`} />
                ) : null}
                {typeof financials.equityRatio === "number" ? (
                  <Metric label="自己資本比率" value={`${financials.equityRatio.toFixed(1)}%`} />
                ) : null}
                {typeof financials.totalAssetTurnover === "number" ? (
                  <Metric label="総資産回転率" value={`${financials.totalAssetTurnover.toFixed(2)}倍`} />
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className={`min-w-0 rounded-3xl bg-gradient-to-br ${riskColor(
              data.risk_level ?? "SAFE"
            )} p-[1px] shadow-2xl`}
          >
            <div className="flex h-full min-w-0 flex-col items-center justify-center rounded-3xl bg-black/80 p-4 backdrop-blur-xl sm:p-6">
              <p className="text-[11px] font-black tracking-[0.24em] text-slate-400 sm:text-sm">
                FINANCIAL SCORE
              </p>

              <ScoreGauge score={data.score ?? 0} />

              <div className="mt-2 text-center">
                <p className="text-xl font-black sm:text-2xl">
                  判定：{financialInsight.verdict}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Danger Score {data.danger_score ?? 0} / 100
                </p>
              </div>

              <div className="mt-5 w-full space-y-3">
                <ScoreBar label="成長力" value={scoreBreakdown.growth ?? 0} max={40} />
                <ScoreBar label="収益品質" value={scoreBreakdown.quality ?? 0} max={30} />
                <ScoreBar label="安全性" value={scoreBreakdown.safety ?? 0} max={30} />
              </div>
            </div>
          </div>
        </div>

        {latestDisclosure ? (
          <section className="mt-4 rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-4 backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-black tracking-[0.24em] text-cyan-200 sm:text-sm">
                  LATEST DISCLOSURE
                </p>
                <h2 className="mt-2 text-xl font-black leading-snug sm:text-2xl">
                  {latestDisclosure.title}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  TDnet開示日時: {latestDisclosureDate ?? "日時不明"}
                </p>
              </div>
              {latestDisclosureHref ? (
                <a
                  href={latestDisclosureHref}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-cyan-200/30 bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
                >
                  開示資料を確認 ↗
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <CompanyFinancialTrends
          annualHistory={history}
          quarterlyHistory={quarterlyHistory}
        />

        <div
          data-company-section="financial-details"
          className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2"
        >
          <Panel title="決算探偵 判定">
            <FinancialInsightPanel insight={financialInsight} compact />
          </Panel>

          <Panel title="警戒シグナル">
            {canShowProDetail ? (
              (risk.flags ?? []).length === 0 ? (
                <p className="rounded-2xl border border-green-400/15 bg-green-500/5 p-4 font-bold text-green-200">
                  主要な警戒フラグは検出されていません。
                </p>
              ) : (
                <div className="space-y-3">
                  {(risk.flags ?? []).map((flag: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm sm:text-base"
                    >
                      <p className="font-black text-yellow-300">{flag.title}</p>
                      {flag.description ? (
                        <p className="mt-2 text-slate-300">{flag.description}</p>
                      ) : null}
                      <p className="mt-2 text-sm font-bold text-yellow-200">
                        スコア影響 +{flag.scoreImpact ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <ProLock
                title="警戒シグナルの内訳はPro限定です"
                message="Danger Scoreを構成する項目とスコア影響を確認できます。"
              />
            )}
          </Panel>
        </div>

        <div data-company-priority-flow="true" className="mt-4 min-w-0">
          <CompanyEarningsChange
            annualHistory={history}
            quarterlyHistory={quarterlyHistory}
            canShowProDetail={canShowProDetail}
            lockedContent={
              <ProLock
                title="決算変化はPro限定です"
                message="最新四半期と比較期の売上・営業利益・営業CFの差を確認できます。"
              />
            }
          />

          <div data-company-section="ai-analysis">
            <Panel title="詳細判定">
              {detailPermission.allowed ? (
                <FinancialInsightPanel insight={financialInsight} />
              ) : (
                <ProLock
                  title="詳細判定はPro限定です"
                  message="無料では1日1回まで。Proでは全銘柄の判定根拠と次回確認項目を制限なく確認できます。"
                />
              )}
            </Panel>
          </div>

          <div data-company-section="news">
            <Panel title="ニュース / IR">
              <CompanyNewsCarousel items={companyNews} />
            </Panel>
          </div>

          <div
            data-company-section="board"
            className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6"
          >
            <h2 className="text-2xl font-black">投資家コメント</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-400">
              {boardSummary}
            </p>
            <CompanyBoard
              ticker={data.ticker}
              companyName={data.company_name}
              comments={comments as BoardComment[]}
              isLoggedIn={isLoggedIn}
            />
          </div>
        </div>

        <p
          data-company-section="disclaimer"
          className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-slate-400"
        >
          Financial Score・Danger Score・各判定は、取得済みの公式開示データと固定ルールに基づく情報整理です。投資助言ではありません。
        </p>
      </section>

      <FeedbackButton />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-black sm:text-2xl">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
      <h2 className="text-2xl font-black">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
        {children}
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  return (
    <div className="relative my-5 flex h-36 w-36 items-center justify-center rounded-full bg-white/10 sm:h-44 sm:w-44">
      <div className="absolute inset-2 rounded-full bg-[#050816]" />
      <div className="relative text-center">
        <p className="text-5xl font-black sm:text-6xl">{score}</p>
        <p className="text-sm text-slate-400">/ 100</p>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-slate-400">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-green-400"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
