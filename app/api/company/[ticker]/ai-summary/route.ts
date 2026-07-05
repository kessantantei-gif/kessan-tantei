import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteProps = {
  params: Promise<{ ticker: string }>;
};

type Financials = Record<string, number | boolean | null | undefined>;

type RiskFlag = {
  title?: string;
  description?: string;
  level?: string;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function riskTitle(flag: RiskFlag) {
  return flag.title || flag.description || "リスクシグナル";
}

function buildSummary(companyName: string, score: number, dangerScore: number, financials: Financials, riskFlags: RiskFlag[]) {
  const revenueGrowth = num(financials.revenueGrowth);
  const grossProfitGrowth = num(financials.grossProfitGrowth);
  const operatingMargin = num(financials.operatingMargin);
  const operatingCFMargin = num(financials.operatingCFMargin ?? financials.ocfMargin);
  const equityRatio = num(financials.equityRatio);
  const cashRatio = num(financials.cashRatio);

  const positives: string[] = [];
  const cautions: string[] = [];
  const watchPoints: string[] = [];

  if (revenueGrowth !== null) {
    if (revenueGrowth >= 30) positives.push(`売上成長率は${pct(revenueGrowth)}と高い成長が確認できます。`);
    else if (revenueGrowth >= 10) positives.push(`売上成長率は${pct(revenueGrowth)}で、一定の成長が見られます。`);
    else if (revenueGrowth < 0) cautions.push(`売上成長率は${pct(revenueGrowth)}で、売上の減少に注意が必要です。`);
    else watchPoints.push(`売上成長率は${pct(revenueGrowth)}で、今後の伸びを確認したい水準です。`);
  }

  if (grossProfitGrowth !== null) {
    if (grossProfitGrowth >= 20) positives.push(`売上総利益の成長率は${pct(grossProfitGrowth)}で、粗利ベースの拡大が見られます。`);
    else if (grossProfitGrowth < 0) cautions.push(`売上総利益成長率は${pct(grossProfitGrowth)}で、収益力の低下に注意が必要です。`);
  }

  if (operatingMargin !== null) {
    if (operatingMargin >= 15) positives.push(`営業利益率は${pct(operatingMargin)}と高く、収益性は良好です。`);
    else if (operatingMargin >= 0) watchPoints.push(`営業利益率は${pct(operatingMargin)}で、黒字水準ですが改善余地があります。`);
    else cautions.push(`営業利益率は${pct(operatingMargin)}で、営業赤字の状態です。`);
  }

  if (operatingCFMargin !== null) {
    if (operatingCFMargin >= 10) positives.push(`営業CF率は${pct(operatingCFMargin)}で、キャッシュ創出力が確認できます。`);
    else if (operatingCFMargin >= 0) watchPoints.push(`営業CF率は${pct(operatingCFMargin)}で、キャッシュ面は黒字圏です。`);
    else cautions.push(`営業CF率は${pct(operatingCFMargin)}で、資金流出に注意が必要です。`);
  }

  if (equityRatio !== null) {
    if (equityRatio >= 50) positives.push(`自己資本比率は${pct(equityRatio)}で、財務安全性は比較的高い状態です。`);
    else if (equityRatio < 20) cautions.push(`自己資本比率は${pct(equityRatio)}で、財務安全性に注意が必要です。`);
    else watchPoints.push(`自己資本比率は${pct(equityRatio)}で、財務安全性は中位水準です。`);
  }

  if (cashRatio !== null) {
    if (cashRatio >= 100) positives.push(`現預金と短期負債のバランスは良好です。`);
    else if (cashRatio < 50) cautions.push(`短期的な資金余力には注意が必要です。`);
  }

  for (const flag of riskFlags.slice(0, 3)) {
    cautions.push(`${riskTitle(flag)}が検出されています。`);
  }

  if (score >= 80) positives.unshift(`総合スコアは${score}点で、決算探偵の評価では上位水準です。`);
  else if (score >= 60) watchPoints.unshift(`総合スコアは${score}点で、強みと注意点が混在する水準です。`);
  else cautions.unshift(`総合スコアは${score}点で、慎重に確認したい水準です。`);

  if (dangerScore >= 70) cautions.unshift(`Danger Scoreは${dangerScore}点で、リスク項目の確認が重要です。`);
  else if (dangerScore >= 40) watchPoints.push(`Danger Scoreは${dangerScore}点で、一部リスクに注意が必要です。`);
  else positives.push(`Danger Scoreは${dangerScore}点で、重大なリスクシグナルは限定的です。`);

  const lead = positives[0] ?? watchPoints[0] ?? cautions[0] ?? `${companyName}は、取得済みの決算データをもとに確認中です。`;
  const second = [...positives.slice(1, 3), ...watchPoints.slice(0, 2)].slice(0, 2).join(" ");
  const third = cautions.slice(0, 2).join(" ");
  const summary = [lead, second, third].filter(Boolean).join(" ");

  return {
    summary,
    positives: positives.slice(0, 5),
    cautions: cautions.slice(0, 5),
    watchPoints: watchPoints.slice(0, 5),
  };
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

  const result = buildSummary(
    data.company_name,
    num(data.score) ?? 0,
    num(data.danger_score) ?? 0,
    data.financials ?? {},
    data.risk?.flags ?? []
  );

  return NextResponse.json({
    ticker: data.ticker,
    companyName: data.company_name,
    generatedBy: "rules-v1",
    disclaimer: "このサマリーは決算データの理解補助であり、個別銘柄の売買判断を示すものではありません。",
    ...result,
  });
}
