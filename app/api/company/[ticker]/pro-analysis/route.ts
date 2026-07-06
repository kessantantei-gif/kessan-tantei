import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteProps = {
  params: Promise<{ ticker: string }>;
};

type RiskFlag = {
  title?: string;
  description?: string;
  level?: string;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: number | null) {
  if (value === null) return "データなし";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function riskTitle(flag: RiskFlag) {
  return flag.title || flag.description || "リスクシグナル";
}

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, risk, history")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const financials = data.financials ?? {};
  const riskFlags = (data.risk?.flags ?? []) as RiskFlag[];
  const score = num(data.score);
  const dangerScore = num(data.danger_score);
  const revenueGrowth = num(financials.revenueGrowth);
  const operatingMargin = num(financials.operatingMargin);
  const operatingCFMargin = num(financials.operatingCFMargin ?? financials.ocfMargin);
  const equityRatio = num(financials.equityRatio);

  const freePreview = [
    score !== null ? `総合スコアは${score}点です。` : "総合スコアは確認中です。",
    revenueGrowth !== null ? `売上成長率は${pct(revenueGrowth)}です。` : "売上成長率はデータ取得中です。",
    dangerScore !== null ? `Danger Scoreは${dangerScore}点です。` : "Danger Scoreは確認中です。",
  ];

  const lockedInsights = [
    {
      title: "成長の質",
      detail:
        revenueGrowth !== null && operatingMargin !== null
          ? `売上成長率${pct(revenueGrowth)}に対して営業利益率は${pct(operatingMargin)}です。成長が利益を伴っているかを確認します。`
          : "売上成長と利益率の組み合わせを確認します。",
    },
    {
      title: "キャッシュ創出力",
      detail:
        operatingCFMargin !== null
          ? `営業CF率は${pct(operatingCFMargin)}です。利益とキャッシュのズレを確認します。`
          : "営業CFデータをもとにキャッシュ創出力を確認します。",
    },
    {
      title: "財務耐久力",
      detail:
        equityRatio !== null
          ? `自己資本比率は${pct(equityRatio)}です。資金調達環境の変化に対する耐性を確認します。`
          : "自己資本比率や現預金余力から財務耐久力を確認します。",
    },
    {
      title: "リスク深掘り",
      detail:
        riskFlags.length > 0
          ? `${riskFlags.slice(0, 3).map(riskTitle).join("、")} などのリスクシグナルを深掘りします。`
          : "重大なリスクシグナルが限定的か、注記・希薄化・監査関連を確認します。",
    },
  ];

  return NextResponse.json({
    ticker: data.ticker,
    companyName: data.company_name,
    freePreview,
    lockedInsights,
    cta: "Proで詳細分析を見る",
    disclaimer: "Pro分析は決算データの理解補助であり、個別銘柄の売買判断を示すものではありません。",
  });
}
