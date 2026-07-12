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

type HistoryRow = {
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  operatingCF?: number | null;
  period?: string | null;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function margin(value: number | null | undefined, revenue: number | null | undefined) {
  if (typeof value !== "number" || typeof revenue !== "number" || revenue === 0) return null;
  return (value / revenue) * 100;
}

function riskTitle(flag: RiskFlag) {
  return flag.title || flag.description || "リスクシグナル";
}

function latestTwo(history: HistoryRow[]) {
  const usable = history.filter((row) => typeof row.revenue === "number");
  if (usable.length < 2) return null;
  return { previous: usable.at(-2)!, current: usable.at(-1)! };
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function buildSummary(
  companyName: string,
  score: number,
  dangerScore: number,
  financials: Financials,
  riskFlags: RiskFlag[],
  history: HistoryRow[]
) {
  const revenueGrowth = num(financials.revenueGrowth);
  const grossProfitGrowth = num(financials.grossProfitGrowth);
  const operatingMargin = num(financials.operatingMargin);
  const operatingCFMargin = num(financials.operatingCFMargin ?? financials.ocfMargin);
  const equityRatio = num(financials.equityRatio);
  const cashRatio = num(financials.cashRatio);
  const operatingIncome = num(financials.operatingIncome);
  const operatingCF = num(financials.operatingCF);

  const positives: string[] = [];
  const cautions: string[] = [];
  const watchPoints: string[] = [];

  if (revenueGrowth !== null && operatingMargin !== null) {
    if (revenueGrowth >= 20 && operatingMargin >= 10) {
      positives.push(`売上成長率${pct(revenueGrowth)}に対して営業利益率${pct(operatingMargin)}を確保しており、成長が利益を伴っています。`);
    } else if (revenueGrowth >= 20 && operatingMargin < 0) {
      cautions.push(`売上は${pct(revenueGrowth)}成長していますが、営業利益率は${pct(operatingMargin)}です。成長投資が将来の利益に転換するかを確認したい状態です。`);
    } else if (revenueGrowth < 5 && operatingMargin >= 15) {
      watchPoints.push(`営業利益率は${pct(operatingMargin)}と高い一方、売上成長率は${pct(revenueGrowth)}です。収益性の維持と再成長の両方を確認したい局面です。`);
    } else if (revenueGrowth < 0 && operatingMargin < 0) {
      cautions.push(`売上成長率${pct(revenueGrowth)}、営業利益率${pct(operatingMargin)}で、減収と営業赤字が同時に発生しています。`);
    }
  }

  if (revenueGrowth !== null && grossProfitGrowth !== null) {
    const spread = grossProfitGrowth - revenueGrowth;
    if (spread >= 5) {
      positives.push(`粗利成長率${pct(grossProfitGrowth)}が売上成長率${pct(revenueGrowth)}を上回っており、売上構成や採算の改善がうかがえます。`);
    } else if (spread <= -8) {
      cautions.push(`粗利成長率${pct(grossProfitGrowth)}が売上成長率${pct(revenueGrowth)}を下回っています。売上拡大に対して原価負担が重くなっていないか確認が必要です。`);
    }
  }

  if (operatingMargin !== null && operatingCFMargin !== null) {
    const cashGap = operatingCFMargin - operatingMargin;
    if (operatingMargin > 0 && operatingCFMargin < 0) {
      cautions.push(`営業利益率は${pct(operatingMargin)}と黒字ですが、営業CF率は${pct(operatingCFMargin)}です。利益が現金化されていない可能性があり、売掛金や契約資産など運転資本の動きを確認したい状態です。`);
    } else if (operatingMargin < 0 && operatingCFMargin > 0) {
      watchPoints.push(`営業赤字の一方で営業CF率は${pct(operatingCFMargin)}とプラスです。前受金や非資金費用など、赤字でも現金を確保できている要因を確認したい状態です。`);
    } else if (cashGap >= 8) {
      positives.push(`営業CF率${pct(operatingCFMargin)}が営業利益率${pct(operatingMargin)}を上回り、利益以上のキャッシュ創出が確認できます。`);
    } else if (cashGap <= -10 && operatingMargin > 0) {
      cautions.push(`営業CF率${pct(operatingCFMargin)}が営業利益率${pct(operatingMargin)}を大きく下回っています。利益の質と運転資本負担を確認したい状態です。`);
    }
  } else if (operatingIncome !== null && operatingCF !== null) {
    if (operatingIncome > 0 && operatingCF < 0) {
      cautions.push("営業利益は黒字ですが営業CFはマイナスです。利益とキャッシュの乖離に注意が必要です。");
    }
  }

  if (equityRatio !== null && cashRatio !== null) {
    if (equityRatio >= 50 && cashRatio >= 100) {
      positives.push(`自己資本比率${pct(equityRatio)}、現金比率${pct(cashRatio)}で、成長投資や業績変動に対する財務余力があります。`);
    } else if (equityRatio < 20 && cashRatio < 50) {
      cautions.push(`自己資本比率${pct(equityRatio)}、現金比率${pct(cashRatio)}で、財務基盤と短期資金余力の両面に注意が必要です。`);
    } else if (equityRatio >= 50 && cashRatio < 50) {
      watchPoints.push(`自己資本比率は${pct(equityRatio)}と高い一方、現金比率は${pct(cashRatio)}です。資本構成は安定していますが短期資金の動きは確認が必要です。`);
    }
  } else if (equityRatio !== null) {
    if (equityRatio >= 50) positives.push(`自己資本比率は${pct(equityRatio)}で、財務安全性は比較的高い状態です。`);
    else if (equityRatio < 20) cautions.push(`自己資本比率は${pct(equityRatio)}で、財務安全性に注意が必要です。`);
  }

  const pair = latestTwo(history);
  if (pair) {
    const previousMargin = margin(pair.previous.operatingIncome, pair.previous.revenue);
    const currentMargin = margin(pair.current.operatingIncome, pair.current.revenue);

    if (
      typeof pair.previous.operatingIncome === "number" &&
      typeof pair.current.operatingIncome === "number" &&
      pair.previous.operatingIncome < 0 &&
      pair.current.operatingIncome > 0
    ) {
      positives.push("前期の営業赤字から直近で営業黒字へ転換しています。黒字が継続するか次期も確認したいポイントです。");
    }

    if (previousMargin !== null && currentMargin !== null) {
      const improvement = currentMargin - previousMargin;
      if (improvement >= 5) positives.push(`営業利益率は前期から${improvement.toFixed(1)}ポイント改善しています。売上拡大だけでなく採算改善も進んでいます。`);
      else if (improvement <= -5) cautions.push(`営業利益率は前期から${Math.abs(improvement).toFixed(1)}ポイント悪化しています。原価や販管費の増加要因を確認したい状態です。`);
    }

    if (
      typeof pair.previous.operatingCF === "number" &&
      typeof pair.current.operatingCF === "number"
    ) {
      if (pair.previous.operatingCF < 0 && pair.current.operatingCF > 0) {
        positives.push("営業CFは前期のマイナスからプラスへ転換しており、資金収支が改善しています。");
      } else if (pair.previous.operatingCF > 0 && pair.current.operatingCF < 0) {
        cautions.push("営業CFは前期のプラスからマイナスへ転じています。運転資本や一時的支出の影響を確認したい状態です。");
      }
    }
  }

  const namedRisks = riskFlags.slice(0, 4).map(riskTitle);
  if (namedRisks.length >= 2) {
    cautions.push(`${namedRisks.join("、")}が同時に検出されています。単独の指標ではなく、複数リスクが重なっている点を優先して確認する必要があります。`);
  } else if (namedRisks.length === 1) {
    cautions.push(`${namedRisks[0]}が検出されています。関連する注記や資金調達条件の確認が必要です。`);
  }

  if (score >= 80 && dangerScore < 40) {
    positives.unshift(`総合スコア${score}点、Danger Score${dangerScore}点で、財務評価とリスクのバランスは良好です。`);
  } else if (score >= 70 && dangerScore >= 60) {
    watchPoints.unshift(`総合スコアは${score}点と高めですが、Danger Scoreは${dangerScore}点です。成長性だけでなくリスク項目の中身を優先して確認したい状態です。`);
  } else if (score < 60 && dangerScore >= 60) {
    cautions.unshift(`総合スコア${score}点、Danger Score${dangerScore}点で、収益性・安全性・リスクの複数面を慎重に確認したい水準です。`);
  } else if (score >= 60) {
    watchPoints.unshift(`総合スコアは${score}点、Danger Scoreは${dangerScore}点です。強みと注意点が混在しています。`);
  } else {
    cautions.unshift(`総合スコアは${score}点です。主要財務指標とリスク項目を個別に確認したい水準です。`);
  }

  if (positives.length === 0 && cautions.length === 0 && watchPoints.length === 0) {
    watchPoints.push(`${companyName}は取得済みデータが限定的なため、次回更新後に分析内容を拡充します。`);
  }

  const cleanPositives = unique(positives).slice(0, 6);
  const cleanCautions = unique(cautions).slice(0, 6);
  const cleanWatchPoints = unique(watchPoints).slice(0, 6);
  const lead = cleanPositives[0] ?? cleanWatchPoints[0] ?? cleanCautions[0];
  const second = [...cleanPositives.slice(1, 3), ...cleanWatchPoints.slice(0, 2)].slice(0, 2).join(" ");
  const third = cleanCautions.slice(0, 2).join(" ");

  return {
    summary: [lead, second, third].filter(Boolean).join(" "),
    positives: cleanPositives,
    cautions: cleanCautions,
    watchPoints: cleanWatchPoints,
  };
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

  const result = buildSummary(
    data.company_name,
    num(data.score) ?? 0,
    num(data.danger_score) ?? 0,
    data.financials ?? {},
    data.risk?.flags ?? [],
    (data.history ?? []) as HistoryRow[]
  );

  return NextResponse.json({
    ticker: data.ticker,
    companyName: data.company_name,
    generatedBy: "accounting-rules-v2",
    disclaimer: "このサマリーは決算データの理解補助であり、個別銘柄の売買判断や将来業績を示すものではありません。",
    ...result,
  });
}
