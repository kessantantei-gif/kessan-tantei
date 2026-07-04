import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateComment } from "@/lib/comment-engine";
import { generateLabels } from "@/lib/label-engine";
import { getCompanyNews, summarizeComments } from "@/lib/news-engine";
import {
  canViewAiAnalysis,
  consumeFreeAiUseIfNeeded,
} from "@/lib/pro-engine";
import WatchButton from "@/components/watch-button";
import ProLock from "@/components/pro-lock";
import XShareButton from "@/components/x-share-button";
import CompanyBoard, { type BoardComment } from "@/components/company-board";
import FeedbackButton from "@/components/feedback-button";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ ticker: string }>;
};

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

function yenOku(value: number) {
  return `${(value / 100000000).toFixed(2)} 億円`;
}

function riskLabel(level: string) {
  if (level === "REJECT") return "投資対象外";
  if (level === "DANGEROUS") return "危険";
  if (level === "WARNING") return "警戒";
  if (level === "WATCH") return "要観察";
  return "安全";
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

function pctChange(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatPct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "比較不可";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function metricChangeLabel(current: number, previous: number) {
  if (previous < 0 && current > 0) return "赤字 → 黒字";
  if (previous > 0 && current < 0) return "黒字 → 赤字";
  return formatPct(pctChange(current, previous));
}

function getLatestAndPrevious(history: any[]) {
  if (!Array.isArray(history) || history.length < 2) {
    return { latest: null, previous: null };
  }

  const sorted = [...history].sort(
    (a, b) => Number(a.year ?? 0) - Number(b.year ?? 0)
  );

  return {
    previous: sorted[sorted.length - 2],
    latest: sorted[sorted.length - 1],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;

  const { data } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score")
    .eq("ticker", ticker)
    .maybeSingle();

  const title = data
    ? `${data.company_name} (${data.ticker}) | 決算探偵`
    : "決算探偵";

  const description = data
    ? `Score ${data.score} / Danger ${data.danger_score}｜そのグロース株、本当に買って大丈夫ですか？`
    : "グロース市場特化の財務分析ランキング。";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://kessan-tantei.jp/company/${ticker}`,
      siteName: "決算探偵",
      locale: "ja_JP",
      type: "website",
      images: [
        {
          url: "https://kessan-tantei.jp/og-image.png",
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
      images: ["https://kessan-tantei.jp/og-image.png"],
    },
  };
}

export default async function CompanyPage({ params }: PageProps) {
  const { ticker } = await params;
  const { userId } = await auth();
  const isLoggedIn = Boolean(userId);

  const aiPermission = await canViewAiAnalysis();

  if (aiPermission.allowed && !aiPermission.isPro) {
    await consumeFreeAiUseIfNeeded();
  }

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    notFound();
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

  const { latest, previous } = getLatestAndPrevious(history);
  const canShowProDetail = aiPermission.isPro;

  const detectiveComment = generateComment({
    score: data.score ?? 0,
    dangerScore: data.danger_score ?? 0,
    riskLevel: data.risk_level ?? "SAFE",
    revenue: financials.revenue ?? 0,
    operatingIncome: financials.operatingIncome ?? 0,
    operatingCF: financials.operatingCF ?? 0,
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

  const readableRiskLabel = riskLabel(data.risk_level ?? "SAFE");

  const aiAnalysis = `
【AI詳細財務分析】

総合スコア: ${data.score ?? 0}
Danger Score: ${data.danger_score ?? 0}

売上高: ${yenOku(financials.revenue ?? 0)}
営業利益: ${yenOku(financials.operatingIncome ?? 0)}
営業CF: ${yenOku(financials.operatingCF ?? 0)}

【総合判定】
${
  (data.score ?? 0) >= 80
    ? "財務スコアは高水準です。グロース市場の中では、成長性・収益品質・安全性のバランスが比較的良好です。"
    : (data.score ?? 0) >= 60
    ? "財務状態は平均以上ですが、収益性・営業CF・安全性のいずれかに注意点があります。"
    : "財務面に複数の懸念があります。成長性だけで判断せず、資金繰り・希薄化・Red Flagsを慎重に確認する必要があります。"
}

【営業利益と営業CF】
${
  (financials.operatingIncome ?? 0) > 0 && (financials.operatingCF ?? 0) > 0
    ? "営業利益・営業CFともにプラスで、利益が現金創出に結びついています。利益の質は比較的高いと評価できます。"
    : (financials.operatingIncome ?? 0) > 0 && (financials.operatingCF ?? 0) <= 0
    ? "営業黒字ですが営業CFがマイナスです。売掛金増加、在庫増加、先行費用などにより、利益が現金化されていない可能性があります。"
    : (financials.operatingIncome ?? 0) <= 0 && (financials.operatingCF ?? 0) > 0
    ? "営業赤字ですが営業CFはプラスです。会計上の赤字と資金流出が必ずしも一致していないため、内容の確認が重要です。"
    : "営業利益・営業CFともにマイナスです。グロース企業であっても、資金繰りと追加調達リスクには注意が必要です。"
}

【検出されたリスク】
${(risk.flags ?? []).map((x: any) => `・${x.title}`).join("\n") || "重大なRed Flagは検出されていません。"}

※ 本分析はEDINET等の開示情報をもとにした機械的分析であり、投資助言ではありません。
`;

  return (
    <main className="min-h-screen bg-[#050816] text-white">
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

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="grid gap-5 lg:grid-cols-[1.35fr_420px] lg:gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs tracking-[0.3em] text-slate-500 sm:text-sm">
                  EDINET AUTO ANALYSIS
                </p>

                <h1 className="mt-4 text-3xl font-black leading-tight sm:text-6xl">
                  {data.company_name}
                </h1>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <WatchButton ticker={data.ticker} />
                <XShareButton
                  companyName={data.company_name}
                  ticker={data.ticker}
                  score={data.score ?? 0}
                  dangerScore={data.danger_score ?? 0}
                  riskLabel={readableRiskLabel}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300 sm:px-4 sm:text-sm">
                TSE: {data.ticker}
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300 sm:px-4 sm:text-sm">
                {data.doc_id}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {labels.map((label) => (
                <span
                  key={label.title}
                  className={`rounded-full border px-3 py-1 text-xs font-bold sm:text-sm ${labelClass(label.tone)}`}
                >
                  {label.title}
                </span>
              ))}
            </div>

            <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
              <Metric label="売上高" value={yenOku(financials.revenue ?? 0)} />
              <Metric label="営業利益" value={yenOku(financials.operatingIncome ?? 0)} />
              <Metric label="営業CF" value={yenOku(financials.operatingCF ?? 0)} />
            </div>
          </div>

          <div className={`rounded-3xl bg-gradient-to-br ${riskColor(data.risk_level)} p-[1px] shadow-2xl`}>
            <div className="flex h-full flex-col items-center justify-center rounded-3xl bg-black/80 p-5 backdrop-blur-xl sm:p-8">
              <p className="text-xs tracking-[0.25em] text-slate-400 sm:text-sm">
                TOTAL SCORE
              </p>

              <ScoreGauge score={data.score ?? 0} />

              <div className="mt-2 text-center">
                <p className="text-xl font-black sm:text-2xl">
                  {readableRiskLabel}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Danger Score {data.danger_score ?? 0}
                </p>
              </div>

              <div className="mt-6 w-full space-y-3">
                <ScoreBar label="成長力" value={scoreBreakdown.growth ?? 0} max={40} />
                <ScoreBar label="収益品質" value={scoreBreakdown.quality ?? 0} max={30} />
                <ScoreBar label="安全性" value={scoreBreakdown.safety ?? 0} max={30} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3 lg:gap-6">
          <TrendPanel title="売上推移" data={history} keyName="revenue" />
          <TrendPanel title="営業利益推移" data={history} keyName="operatingIncome" />
          <TrendPanel title="営業CF推移" data={history} keyName="operatingCF" />
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2 lg:gap-6">
          <Panel title="決算探偵の見立て">{detectiveComment}</Panel>

          <Panel title="Danger内訳 / Red Flags">
            {canShowProDetail ? (
              (risk.flags ?? []).length === 0 ? (
                <p>重大なレッドフラッグなし</p>
              ) : (
                <div className="space-y-3">
                  {(risk.flags ?? []).map((flag: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm sm:text-base"
                    >
                      <p className="font-black text-yellow-300">
                        ⚠ {flag.title}
                      </p>
                      <p className="mt-2 text-slate-300">
                        {flag.description ?? "詳細説明はありません。"}
                      </p>
                      <p className="mt-2 text-sm text-yellow-200">
                        Danger impact: +{flag.scoreImpact ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <ProLock
                title="Danger内訳はPro限定です"
                message="どのリスクがDanger Scoreに影響しているか、初月100円のProで確認できます。"
              />
            )}
          </Panel>
        </div>

        <div className="mt-6 rounded-3xl border border-purple-400/20 bg-purple-500/10 p-5 backdrop-blur-xl sm:p-7">
          <p className="text-xs tracking-[0.25em] text-purple-300 sm:text-sm">
            EARNINGS CHANGE
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            決算変化速報
          </h2>

          {canShowProDetail ? (
            latest && previous ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <ChangeMetric
                  label="売上高"
                  current={yenOku(latest.revenue ?? 0)}
                  previous={yenOku(previous.revenue ?? 0)}
                  change={formatPct(pctChange(latest.revenue ?? 0, previous.revenue ?? 0))}
                />
                <ChangeMetric
                  label="営業利益"
                  current={yenOku(latest.operatingIncome ?? 0)}
                  previous={yenOku(previous.operatingIncome ?? 0)}
                  change={metricChangeLabel(latest.operatingIncome ?? 0, previous.operatingIncome ?? 0)}
                />
                <ChangeMetric
                  label="営業CF"
                  current={yenOku(latest.operatingCF ?? 0)}
                  previous={yenOku(previous.operatingCF ?? 0)}
                  change={metricChangeLabel(latest.operatingCF ?? 0, previous.operatingCF ?? 0)}
                />
              </div>
            ) : (
              <p className="mt-4 text-slate-300">
                比較可能な過去データがまだ不足しています。
              </p>
            )
          ) : (
            <div className="mt-4">
              <ProLock
                title="決算変化速報はPro限定です"
                message="前回決算から売上・営業利益・営業CFがどう変化したかを確認できます。"
              />
            </div>
          )}
        </div>

        <div className="mt-6 rounded-3xl border border-yellow-400/20 bg-yellow-500/10 p-5 backdrop-blur-xl sm:p-7">
          <p className="text-xs tracking-[0.25em] text-yellow-300 sm:text-sm">
            AI PREMIUM ANALYSIS
          </p>

          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            🤖 AI詳細分析
          </h2>

          <div className="mt-4">
            {aiPermission.allowed ? (
              <>
                {!aiPermission.isPro ? (
                  <div className="mb-4 rounded-2xl border border-yellow-400/20 bg-black/20 p-4 text-sm text-yellow-200">
                    Free枠で表示中です。残り {Math.max(0, aiPermission.remaining - 1)} 回。
                  </div>
                ) : (
                  <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-slate-500">
                    Pro限定表示 / user: {userId}
                  </div>
                )}

                <pre className="select-none whitespace-pre-wrap font-sans leading-8 text-slate-300">
                  {aiAnalysis}
                </pre>
              </>
            ) : (
              <ProLock
                title="AI詳細分析の無料枠を使い切りました"
                message="AI詳細分析はFreeで3回まで利用できます。Proに登録すると無制限で利用できます。"
              />
            )}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5 backdrop-blur-xl sm:p-7">
          <p className="text-xs tracking-[0.25em] text-cyan-300 sm:text-sm">
            COMPANY NEWS
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            📰 {data.company_name} ニュース
          </h2>

          <div className="mt-4 space-y-3">
            {companyNews.length === 0 ? (
              <p className="text-slate-400">関連ニュースはまだありません。</p>
            ) : (
              companyNews.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-400/40 hover:bg-white/10"
                >
                  <p className="font-bold leading-7">{item.title}</p>

                  <div className="mt-2 text-sm text-slate-400">
                    <p>{item.source || "Google News"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      発行日: {formatNewsDate(item.published_at)}
                    </p>
                  </div>

                  {item.summary ? (
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {item.summary}
                    </p>
                  ) : null}
                </a>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5 backdrop-blur-xl sm:p-7">
          <p className="text-xs tracking-[0.25em] text-cyan-300 sm:text-sm">
            BOARD SUMMARY
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            AI掲示板要約
          </h2>
          <p className="mt-4 leading-8 text-slate-300">{boardSummary}</p>
          <p className="mt-3 text-xs text-slate-500">
            ※ 掲示板コメント内の単語傾向から機械的に要約しています。投資助言ではありません。
          </p>
        </div>

        <CompanyBoard
          ticker={data.ticker}
          companyName={data.company_name}
          comments={comments as BoardComment[]}
          isLoggedIn={isLoggedIn}
          currentUserId={userId}
        />
      </section>

      <FeedbackButton />
    </main>
  );
}

function ChangeMetric({
  label,
  current,
  previous,
  change,
}: {
  label: string;
  current: string;
  previous: string;
  change: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-xl font-black text-purple-200">{previous}</p>
      <p className="text-sm text-slate-500">↓</p>
      <p className="text-2xl font-black text-white">{current}</p>
      <p className="mt-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1 text-sm font-bold text-purple-200">
        {change}
      </p>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative mt-5 h-40 w-40 sm:mt-6 sm:h-44 sm:w-44">
      <svg className="h-40 w-40 -rotate-90 sm:h-44 sm:w-44" viewBox="0 0 176 176">
        <circle cx="88" cy="88" r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth="14" fill="transparent" />
        <circle cx="88" cy="88" r={radius} stroke="url(#scoreGradient)" strokeWidth="14" fill="transparent" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-5xl font-black text-green-400 sm:text-6xl">
          {score}
        </p>
        <p className="text-xs tracking-[0.25em] text-slate-500">SCORE</p>
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const percent = Math.max(0, Math.min(100, Math.round((value / max) * 100)));

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-slate-300">
        <span>{label}</span>
        <span>{value}/{max}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-400 to-cyan-400"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function TrendPanel({
  title,
  data,
  keyName,
}: {
  title: string;
  data: any[];
  keyName: "revenue" | "operatingIncome" | "operatingCF";
}) {
  const values = data.map((d) => Math.abs(d[keyName] ?? 0));
  const max = Math.max(...values, 1);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
        <p className="text-xs text-slate-500">単位: 億円</p>
      </div>

      <div className="mt-6 flex h-36 items-end gap-3 sm:h-40 sm:gap-4">
        {data.length === 0 ? (
          <p className="text-sm text-slate-400">データなし</p>
        ) : (
          data.map((item: any) => {
            const rawValue = item[keyName] ?? 0;
            const height = Math.max(8, (Math.abs(rawValue) / max) * 120);

            return (
              <div key={`${item.year}-${keyName}`} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t-xl ${
                    rawValue >= 0
                      ? "bg-gradient-to-t from-green-500 to-cyan-400"
                      : "bg-gradient-to-t from-red-600 to-orange-400"
                  }`}
                  style={{ height }}
                />
                <p className="text-xs text-slate-400">{item.year}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-xl font-bold sm:text-2xl">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-7">
      <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
        {children}
      </div>
    </div>
  );
}