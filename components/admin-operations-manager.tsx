"use client";

import { useEffect, useMemo, useState } from "react";

type CompanyStatus = {
  ticker: string;
  companyName: string;
  score: number | null;
  dangerScore: number | null;
  riskLevel: string | null;
  historyCount: number;
  latestPeriod: string;
  missing: string[];
  needsAttention: boolean;
  earningsFlashReady: boolean;
  riskFlagCount: number;
};

type NewsItem = {
  id: string | number;
  ticker?: string | null;
  title?: string | null;
  url?: string | null;
  source?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  needsAttention: boolean;
};

type OperationsPayload = {
  summary: {
    totalCompanies: number;
    needsAttention: number;
    earningsFlashReady: number;
    earningsFlashUnavailable: number;
    newsCount: number;
    brokenNews: number;
    newsReadError: string | null;
  };
  companies: CompanyStatus[];
  news: NewsItem[];
};

type AnalysisResult = {
  ticker: string;
  companyName: string;
  generatedAt: string;
  score: number | null;
  dangerScore: number | null;
  insights: {
    title: string;
    detail: string;
    tone: "positive" | "caution" | "neutral";
  }[];
  disclaimer: string;
};

function toneClass(tone: AnalysisResult["insights"][number]["tone"]) {
  if (tone === "positive") return "border-green-400/20 bg-green-500/10 text-green-100";
  if (tone === "caution") return "border-red-400/20 bg-red-500/10 text-red-100";
  return "border-white/10 bg-white/5 text-slate-200";
}

function formatDate(value?: string | null) {
  if (!value) return "日時不明";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

export default function AdminOperationsManager() {
  const [payload, setPayload] = useState<OperationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(true);
  const [activeTab, setActiveTab] = useState<"companies" | "news">("companies");
  const [refreshingTicker, setRefreshingTicker] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/operations", { cache: "no-store" });
      const data = (await response.json()) as OperationsPayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "運営データの取得に失敗しました。");
      setPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "運営データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredCompanies = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (payload?.companies ?? []).filter((company) => {
      if (onlyAttention && !company.needsAttention) return false;
      if (!normalized) return true;
      return `${company.ticker} ${company.companyName} ${company.missing.join(" ")}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [payload, query, onlyAttention]);

  const filteredNews = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (payload?.news ?? []).filter((item) => {
      if (onlyAttention && !item.needsAttention) return false;
      if (!normalized) return true;
      return `${item.ticker ?? ""} ${item.title ?? ""} ${item.source ?? ""}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [payload, query, onlyAttention]);

  async function regenerate(ticker: string) {
    setRefreshingTicker(ticker);
    setAnalysis(null);
    setError("");

    try {
      const response = await fetch("/api/admin/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const data = (await response.json()) as AnalysisResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "AI分析の再計算に失敗しました。");
      setAnalysis(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI分析の再計算に失敗しました。");
    } finally {
      setRefreshingTicker(null);
    }
  }

  if (loading) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">運営データを読み込み中です。</div>;
  }

  if (!payload) {
    return (
      <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-8 text-red-100">
        <p className="font-black">データを取得できませんでした。</p>
        <p className="mt-2 text-sm">{error}</p>
        <button onClick={() => void load()} className="mt-5 rounded-full bg-white px-5 py-2 font-black text-slate-950">
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["解析対象", payload.summary.totalCompanies, "text-white"],
          ["要対応", payload.summary.needsAttention, "text-red-200"],
          ["速報生成可", payload.summary.earningsFlashReady, "text-green-200"],
          ["速報データ不足", payload.summary.earningsFlashUnavailable, "text-yellow-200"],
          ["最新ニュース", payload.summary.newsCount, "text-cyan-200"],
          ["ニュース不備", payload.summary.brokenNews, "text-red-200"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {payload.summary.newsReadError ? (
        <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          ニュース取得時の注意: {payload.summary.newsReadError}
        </div>
      ) : null}

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab("companies")}
              className={`rounded-full px-4 py-2 text-sm font-black ${activeTab === "companies" ? "bg-green-400 text-slate-950" : "border border-white/10 bg-black/20 text-slate-300"}`}
            >
              AI・データ管理
            </button>
            <button
              onClick={() => setActiveTab("news")}
              className={`rounded-full px-4 py-2 text-sm font-black ${activeTab === "news" ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-black/20 text-slate-300"}`}
            >
              コンテンツ管理
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="コード・会社名・欠損項目で検索"
              className="min-h-11 rounded-full border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-green-400/50"
            />
            <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
              <input
                type="checkbox"
                checked={onlyAttention}
                onChange={(event) => setOnlyAttention(event.target.checked)}
              />
              要対応のみ
            </label>
            <button onClick={() => void load()} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black hover:bg-white/10">
              再読込
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
      ) : null}

      {activeTab === "companies" ? (
        <section className="mt-6 space-y-4">
          {filteredCompanies.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-400">該当する会社はありません。</div>
          ) : (
            filteredCompanies.map((company) => (
              <article key={company.ticker} className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-300">{company.ticker}</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${company.needsAttention ? "bg-red-500/15 text-red-200" : "bg-green-500/15 text-green-200"}`}>
                        {company.needsAttention ? "要対応" : "正常"}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${company.earningsFlashReady ? "bg-cyan-500/15 text-cyan-200" : "bg-yellow-500/15 text-yellow-200"}`}>
                        決算速報 {company.earningsFlashReady ? "生成可" : "データ不足"}
                      </span>
                    </div>
                    <h2 className="mt-3 text-xl font-black text-white">{company.companyName}</h2>
                    <p className="mt-2 text-sm text-slate-400">
                      最新期間: {company.latestPeriod} / 履歴: {company.historyCount}期 / Red Flags: {company.riskFlagCount}件
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Score: {company.score ?? "—"} / Danger: {company.dangerScore ?? "—"} / Risk: {company.riskLevel ?? "—"}
                    </p>
                    {company.missing.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {company.missing.map((item) => (
                          <span key={item} className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-100">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      onClick={() => void regenerate(company.ticker)}
                      disabled={refreshingTicker === company.ticker}
                      className="rounded-full bg-yellow-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300 disabled:opacity-50"
                    >
                      {refreshingTicker === company.ticker ? "再計算中" : "AI分析を再計算"}
                    </button>
                    <a
                      href={`/company/${company.ticker}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
                    >
                      会社ページ ↗
                    </a>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      ) : (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {filteredNews.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-400">該当するニュースはありません。</div>
          ) : (
            filteredNews.map((item) => (
              <article key={item.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {item.ticker ? <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{item.ticker}</span> : null}
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${item.needsAttention ? "bg-red-500/15 text-red-200" : "bg-green-500/15 text-green-200"}`}>
                    {item.needsAttention ? "要確認" : "公開データ正常"}
                  </span>
                </div>
                <h2 className="mt-3 font-black leading-7 text-white">{item.title?.trim() || "タイトル未設定"}</h2>
                <p className="mt-3 text-sm text-slate-400">{item.source || "配信元不明"}</p>
                <p className="mt-1 text-xs text-slate-500">公開: {formatDate(item.published_at || item.created_at)}</p>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-black text-cyan-300 hover:text-cyan-200">
                    ニュースを確認 ↗
                  </a>
                ) : (
                  <p className="mt-4 text-sm font-black text-red-200">URLが設定されていません。</p>
                )}
              </article>
            ))
          )}
        </section>
      )}

      {analysis ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="mx-auto my-8 max-w-4xl rounded-3xl border border-yellow-300/30 bg-[#080b14] p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.25em] text-yellow-200">RECALCULATED ANALYSIS</p>
                <h2 className="mt-2 text-2xl font-black">{analysis.companyName}（{analysis.ticker}）</h2>
                <p className="mt-2 text-sm text-slate-400">再計算: {formatDate(analysis.generatedAt)}</p>
              </div>
              <button onClick={() => setAnalysis(null)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-black">閉じる</button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {analysis.insights.map((insight) => (
                <div key={`${insight.title}-${insight.detail}`} className={`rounded-2xl border p-4 ${toneClass(insight.tone)}`}>
                  <p className="font-black">{insight.title}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{insight.detail}</p>
                </div>
              ))}
            </div>

            {analysis.insights.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-4 text-yellow-100">
                分析に必要な主要指標が不足しています。
              </p>
            ) : null}

            <p className="mt-5 text-xs leading-6 text-slate-500">{analysis.disclaimer}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
