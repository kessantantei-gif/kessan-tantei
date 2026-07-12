import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

type Financials = Record<string, number | boolean | null | undefined>;
type HistoryRow = Record<string, string | number | null | undefined>;
type RiskFlag = { title?: string; description?: string; level?: string };

type CompanyRow = {
  ticker: string;
  company_name: string;
  score: number | null;
  danger_score: number | null;
  risk_level: string | null;
  financials: Financials | null;
  history: HistoryRow[] | null;
  risk: { flags?: RiskFlag[] } | null;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: number | null) {
  if (value === null) return "データなし";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function latestPeriod(history: HistoryRow[]) {
  const last = history.at(-1);
  if (!last) return "データなし";
  return String(
    last.fiscalPeriod ??
      last.fiscal_period ??
      last.period ??
      last.fiscalYear ??
      last.year ??
      "期間不明"
  );
}

function companyStatus(company: CompanyRow) {
  const financials = company.financials ?? {};
  const history = company.history ?? [];
  const missing: string[] = [];

  if (company.score === null) missing.push("総合スコア");
  if (company.danger_score === null) missing.push("Danger Score");
  if (num(financials.revenue) === null) missing.push("売上高");
  if (num(financials.operatingIncome) === null) missing.push("営業利益");
  if (num(financials.operatingCF) === null) missing.push("営業CF");
  if (num(financials.equityRatio) === null) missing.push("自己資本比率");
  if (history.length < 2) missing.push("前期比較データ");
  if (!company.risk) missing.push("リスク分析");

  const flags = company.risk?.flags ?? [];

  return {
    ticker: company.ticker,
    companyName: company.company_name,
    score: company.score,
    dangerScore: company.danger_score,
    riskLevel: company.risk_level,
    historyCount: history.length,
    latestPeriod: latestPeriod(history),
    missing,
    needsAttention: missing.length > 0,
    earningsFlashReady: history.length >= 2,
    riskFlagCount: flags.length,
  };
}

function buildAnalysis(company: CompanyRow) {
  const financials = company.financials ?? {};
  const revenueGrowth = num(financials.revenueGrowth);
  const grossProfitGrowth = num(financials.grossProfitGrowth);
  const operatingMargin = num(financials.operatingMargin);
  const operatingCFMargin = num(financials.operatingCFMargin ?? financials.ocfMargin);
  const equityRatio = num(financials.equityRatio);
  const cashRatio = num(financials.cashRatio);
  const flags = company.risk?.flags ?? [];

  const insights: { title: string; detail: string; tone: "positive" | "caution" | "neutral" }[] = [];

  if (revenueGrowth !== null && operatingMargin !== null) {
    if (revenueGrowth >= 20 && operatingMargin > 0) {
      insights.push({
        title: "黒字高成長",
        detail: `売上成長率${pct(revenueGrowth)}、営業利益率${pct(operatingMargin)}で、成長と営業黒字が両立しています。`,
        tone: "positive",
      });
    } else if (revenueGrowth >= 20 && operatingMargin < 0) {
      insights.push({
        title: "赤字高成長",
        detail: `売上成長率${pct(revenueGrowth)}に対し営業利益率は${pct(operatingMargin)}です。成長投資が利益と資金繰りへ与える影響を確認します。`,
        tone: "caution",
      });
    } else {
      insights.push({
        title: "成長と収益性",
        detail: `売上成長率${pct(revenueGrowth)}、営業利益率${pct(operatingMargin)}です。両指標のバランスを確認します。`,
        tone: "neutral",
      });
    }
  }

  if (grossProfitGrowth !== null && revenueGrowth !== null) {
    const gap = grossProfitGrowth - revenueGrowth;
    insights.push({
      title: "粗利成長の質",
      detail:
        gap >= 5
          ? `粗利益成長率${pct(grossProfitGrowth)}が売上成長率を上回っており、粗利ベースの成長は比較的良好です。`
          : gap <= -5
            ? `粗利益成長率${pct(grossProfitGrowth)}が売上成長率${pct(revenueGrowth)}を下回っています。原価率や事業構成の変化を確認します。`
            : `粗利益成長率${pct(grossProfitGrowth)}は売上成長率とおおむね同水準です。`,
      tone: gap <= -5 ? "caution" : gap >= 5 ? "positive" : "neutral",
    });
  }

  if (operatingMargin !== null && operatingCFMargin !== null) {
    const gap = operatingCFMargin - operatingMargin;
    insights.push({
      title: "利益と営業CF",
      detail:
        operatingMargin > 0 && operatingCFMargin < 0
          ? `営業利益率${pct(operatingMargin)}に対し営業CF率は${pct(operatingCFMargin)}です。利益が現金化されていない可能性があるため、運転資本を確認します。`
          : gap < -10
            ? `営業CF率${pct(operatingCFMargin)}が営業利益率${pct(operatingMargin)}を大きく下回っています。利益の質を継続確認します。`
            : `営業利益率${pct(operatingMargin)}と営業CF率${pct(operatingCFMargin)}の関係に大きな逆転は見られません。`,
      tone: operatingCFMargin < 0 || gap < -10 ? "caution" : "positive",
    });
  }

  if (equityRatio !== null || cashRatio !== null) {
    insights.push({
      title: "財務耐久力",
      detail: `自己資本比率${pct(equityRatio)}、現金比率${pct(cashRatio)}です。赤字継続や成長投資を支えられる財務余力を確認します。`,
      tone:
        (equityRatio !== null && equityRatio < 20) || (cashRatio !== null && cashRatio < 50)
          ? "caution"
          : "neutral",
    });
  }

  if (flags.length > 0) {
    insights.push({
      title: "Red Flags",
      detail: `${flags.slice(0, 4).map((flag) => flag.title || flag.description || "リスクシグナル").join("、")}が検出されています。`,
      tone: "caution",
    });
  }

  return {
    ticker: company.ticker,
    companyName: company.company_name,
    generatedAt: new Date().toISOString(),
    score: company.score,
    dangerScore: company.danger_score,
    insights,
    disclaimer: "管理画面の再計算結果です。決算データの理解補助であり、個別銘柄の売買判断を示すものではありません。",
  };
}

async function requireAdmin() {
  return await isAdminUser();
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [{ data: companies, error: companyError }, { data: news, error: newsError }] = await Promise.all([
    supabaseAdmin
      .from("company_analyses")
      .select("ticker, company_name, score, danger_score, risk_level, financials, history, risk")
      .neq("risk_level", "EXCLUDED")
      .order("ticker", { ascending: true })
      .limit(1000),
    supabaseAdmin
      .from("growth_news")
      .select("id, ticker, title, url, source, published_at, created_at")
      .order("published_at", { ascending: false })
      .limit(100),
  ]);

  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  const statuses = ((companies ?? []) as CompanyRow[]).map(companyStatus);
  const newsItems = (news ?? []).map((item) => ({
    ...item,
    needsAttention: !item.title?.trim() || !item.url?.trim(),
  }));

  return NextResponse.json({
    summary: {
      totalCompanies: statuses.length,
      needsAttention: statuses.filter((item) => item.needsAttention).length,
      earningsFlashReady: statuses.filter((item) => item.earningsFlashReady).length,
      earningsFlashUnavailable: statuses.filter((item) => !item.earningsFlashReady).length,
      newsCount: newsItems.length,
      brokenNews: newsItems.filter((item) => item.needsAttention).length,
      newsReadError: newsError?.message ?? null,
    },
    companies: statuses,
    news: newsItems,
  });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { ticker?: string } | null;
  const ticker = body?.ticker?.trim();

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, risk_level, financials, history, risk")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
  }

  return NextResponse.json(buildAnalysis(data as CompanyRow));
}
