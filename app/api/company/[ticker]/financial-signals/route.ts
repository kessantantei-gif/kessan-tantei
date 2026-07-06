import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteProps = {
  params: Promise<{ ticker: string }>;
};

type Signal = {
  type: "positive" | "caution" | "watch";
  title: string;
  detail: string;
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

function add(signals: Signal[], type: Signal["type"], title: string, detail: string) {
  signals.push({ type, title, detail });
}

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, financials, risk")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const financials = data.financials ?? {};
  const riskFlags = (data.risk?.flags ?? []) as RiskFlag[];
  const signals: Signal[] = [];

  const score = num(data.score);
  const dangerScore = num(data.danger_score);
  const revenueGrowth = num(financials.revenueGrowth);
  const grossProfitGrowth = num(financials.grossProfitGrowth);
  const operatingMargin = num(financials.operatingMargin);
  const operatingCFMargin = num(financials.operatingCFMargin ?? financials.ocfMargin);
  const equityRatio = num(financials.equityRatio);
  const cashRatio = num(financials.cashRatio);

  if (score !== null) {
    if (score >= 80) add(signals, "positive", "総合スコアが高い", `総合スコアは${score}点です。`);
    else if (score < 50) add(signals, "caution", "総合スコアが低め", `総合スコアは${score}点です。`);
    else add(signals, "watch", "総合スコアは中位", `総合スコアは${score}点です。`);
  }

  if (revenueGrowth !== null) {
    if (revenueGrowth >= 30) add(signals, "positive", "売上成長が強い", `売上成長率は${pct(revenueGrowth)}です。`);
    else if (revenueGrowth < 0) add(signals, "caution", "売上が減少", `売上成長率は${pct(revenueGrowth)}です。`);
    else add(signals, "watch", "売上成長は確認対象", `売上成長率は${pct(revenueGrowth)}です。`);
  }

  if (grossProfitGrowth !== null) {
    if (grossProfitGrowth >= 20) add(signals, "positive", "粗利成長が強い", `売上総利益成長率は${pct(grossProfitGrowth)}です。`);
    else if (grossProfitGrowth < 0) add(signals, "caution", "粗利が減少", `売上総利益成長率は${pct(grossProfitGrowth)}です。`);
  }

  if (operatingMargin !== null) {
    if (operatingMargin >= 10) add(signals, "positive", "営業利益率が良好", `営業利益率は${pct(operatingMargin)}です。`);
    else if (operatingMargin < 0) add(signals, "caution", "営業赤字", `営業利益率は${pct(operatingMargin)}です。`);
    else add(signals, "watch", "営業利益率は改善余地あり", `営業利益率は${pct(operatingMargin)}です。`);
  }

  if (operatingCFMargin !== null) {
    if (operatingCFMargin >= 10) add(signals, "positive", "営業CFが強い", `営業CF率は${pct(operatingCFMargin)}です。`);
    else if (operatingCFMargin < 0) add(signals, "caution", "営業CFがマイナス", `営業CF率は${pct(operatingCFMargin)}です。`);
    else add(signals, "watch", "営業CFは黒字圏", `営業CF率は${pct(operatingCFMargin)}です。`);
  }

  if (equityRatio !== null) {
    if (equityRatio >= 50) add(signals, "positive", "自己資本比率が高い", `自己資本比率は${pct(equityRatio)}です。`);
    else if (equityRatio < 20) add(signals, "caution", "自己資本比率に注意", `自己資本比率は${pct(equityRatio)}です。`);
    else add(signals, "watch", "財務安全性は中位", `自己資本比率は${pct(equityRatio)}です。`);
  }

  if (cashRatio !== null) {
    if (cashRatio >= 100) add(signals, "positive", "短期資金余力が高い", `現預金余力は${pct(cashRatio)}です。`);
    else if (cashRatio < 50) add(signals, "caution", "短期資金余力に注意", `現預金余力は${pct(cashRatio)}です。`);
  }

  if (dangerScore !== null) {
    if (dangerScore >= 70) add(signals, "caution", "Danger Scoreが高い", `Danger Scoreは${dangerScore}点です。`);
    else if (dangerScore <= 30) add(signals, "positive", "Danger Scoreは低め", `Danger Scoreは${dangerScore}点です。`);
    else add(signals, "watch", "一部リスクに注意", `Danger Scoreは${dangerScore}点です。`);
  }

  for (const flag of riskFlags.slice(0, 4)) {
    add(signals, "caution", flag.title ?? flag.description ?? "リスクシグナルあり", flag.description ?? flag.level ?? "要確認です。");
  }

  const positive = signals.filter((signal) => signal.type === "positive").slice(0, 6);
  const caution = signals.filter((signal) => signal.type === "caution").slice(0, 6);
  const watch = signals.filter((signal) => signal.type === "watch").slice(0, 6);

  return NextResponse.json({
    ticker: data.ticker,
    companyName: data.company_name,
    positive,
    caution,
    watch,
    summary:
      caution.length > positive.length
        ? "注意シグナルが多めです。リスク項目とキャッシュフローを優先して確認してください。"
        : positive.length > 0
          ? "良いシグナルが確認できます。成長性・収益性・安全性のバランスを確認してください。"
          : "取得済みデータから確認できるシグナルは限定的です。",
    disclaimer: "財務シグナルは決算データの理解補助であり、個別銘柄の売買判断を示すものではありません。",
  });
}
