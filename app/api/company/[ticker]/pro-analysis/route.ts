import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isProUser } from "@/lib/pro-engine";

type RouteProps = {
  params: Promise<{ ticker: string }>;
};

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
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: number | null) {
  if (value === null) return "データなし";
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

function buildGrowthQuality(
  revenueGrowth: number | null,
  grossProfitGrowth: number | null,
  operatingMargin: number | null
) {
  if (revenueGrowth === null) return "売上成長率の比較データが不足しています。";

  if (revenueGrowth >= 20 && operatingMargin !== null && operatingMargin >= 10) {
    return `売上成長率${pct(revenueGrowth)}に対して営業利益率${pct(operatingMargin)}を確保しており、成長が利益を伴っています。`;
  }

  if (revenueGrowth >= 20 && operatingMargin !== null && operatingMargin < 0) {
    return `売上は${pct(revenueGrowth)}成長していますが、営業利益率は${pct(operatingMargin)}です。先行投資が将来の収益へ転換するかを継続確認する必要があります。`;
  }

  if (grossProfitGrowth !== null) {
    const spread = grossProfitGrowth - revenueGrowth;
    if (spread >= 5) {
      return `粗利成長率${pct(grossProfitGrowth)}が売上成長率${pct(revenueGrowth)}を上回り、商品構成や採算の改善がうかがえます。`;
    }
    if (spread <= -8) {
      return `粗利成長率${pct(grossProfitGrowth)}が売上成長率${pct(revenueGrowth)}を下回っており、売上拡大に対する原価負担の増加を確認したい状態です。`;
    }
  }

  return `売上成長率は${pct(revenueGrowth)}です。利益率や粗利成長率とあわせて、成長の質を確認します。`;
}

function buildCashQuality(
  operatingMargin: number | null,
  operatingCFMargin: number | null,
  operatingIncome: number | null,
  operatingCF: number | null
) {
  if (operatingMargin !== null && operatingCFMargin !== null) {
    if (operatingMargin > 0 && operatingCFMargin < 0) {
      return `営業利益率${pct(operatingMargin)}に対して営業CF率は${pct(operatingCFMargin)}です。会計上の利益が現金化されていない可能性があり、売掛金・契約資産・棚卸資産など運転資本の動きを確認したい状態です。`;
    }
    if (operatingMargin < 0 && operatingCFMargin > 0) {
      return `営業赤字の一方、営業CF率は${pct(operatingCFMargin)}とプラスです。前受金や減価償却など、赤字でもキャッシュを確保できている要因を確認します。`;
    }

    const gap = operatingCFMargin - operatingMargin;
    if (gap >= 8) {
      return `営業CF率${pct(operatingCFMargin)}が営業利益率${pct(operatingMargin)}を上回り、利益以上のキャッシュ創出が確認できます。`;
    }
    if (gap <= -10 && operatingMargin > 0) {
      return `営業CF率${pct(operatingCFMargin)}が営業利益率${pct(operatingMargin)}を大きく下回っています。利益の質と運転資本負担を確認する必要があります。`;
    }

    return `営業利益率${pct(operatingMargin)}、営業CF率${pct(operatingCFMargin)}で、利益とキャッシュの整合性を確認します。`;
  }

  if (operatingIncome !== null && operatingCF !== null && operatingIncome > 0 && operatingCF < 0) {
    return "営業利益は黒字ですが営業CFはマイナスです。利益と現金収支の乖離に注意が必要です。";
  }

  return "営業利益率と営業CF率の組み合わせから、利益の質とキャッシュ創出力を確認します。";
}

function buildFinancialDurability(equityRatio: number | null, cashRatio: number | null) {
  if (equityRatio !== null && cashRatio !== null) {
    if (equityRatio >= 50 && cashRatio >= 100) {
      return `自己資本比率${pct(equityRatio)}、現金比率${pct(cashRatio)}で、成長投資や業績変動に対応できる財務余力があります。`;
    }
    if (equityRatio < 20 && cashRatio < 50) {
      return `自己資本比率${pct(equityRatio)}、現金比率${pct(cashRatio)}で、財務基盤と短期資金余力の両面に注意が必要です。`;
    }
    if (equityRatio >= 50 && cashRatio < 50) {
      return `自己資本比率は${pct(equityRatio)}と高い一方、現金比率は${pct(cashRatio)}です。資本構成は安定していますが、短期資金の動きは確認が必要です。`;
    }
    return `自己資本比率${pct(equityRatio)}、現金比率${pct(cashRatio)}です。資本構成と短期支払余力をあわせて確認します。`;
  }

  if (equityRatio !== null) {
    return `自己資本比率は${pct(equityRatio)}です。現預金余力や短期負債とあわせて財務耐久力を確認します。`;
  }

  return "自己資本比率、現預金余力、短期負債から財務耐久力を確認します。";
}

function buildTrendInsight(history: HistoryRow[]) {
  const pair = latestTwo(history);
  if (!pair) return "2期比較データが不足しているため、次回更新後に変化分析を拡充します。";

  const previousMargin = margin(pair.previous.operatingIncome, pair.previous.revenue);
  const currentMargin = margin(pair.current.operatingIncome, pair.current.revenue);
  const comments: string[] = [];

  if (
    typeof pair.previous.operatingIncome === "number" &&
    typeof pair.current.operatingIncome === "number" &&
    pair.previous.operatingIncome < 0 &&
    pair.current.operatingIncome > 0
  ) {
    comments.push("前期の営業赤字から直近で営業黒字へ転換しています。黒字の継続性を確認したい局面です。");
  }

  if (previousMargin !== null && currentMargin !== null) {
    const improvement = currentMargin - previousMargin;
    if (improvement >= 5) comments.push(`営業利益率は前期から${improvement.toFixed(1)}ポイント改善しています。`);
    else if (improvement <= -5) comments.push(`営業利益率は前期から${Math.abs(improvement).toFixed(1)}ポイント悪化しています。`);
  }

  if (
    typeof pair.previous.operatingCF === "number" &&
    typeof pair.current.operatingCF === "number"
  ) {
    if (pair.previous.operatingCF < 0 && pair.current.operatingCF > 0) {
      comments.push("営業CFはマイナスからプラスへ転換し、資金収支が改善しています。");
    } else if (pair.previous.operatingCF > 0 && pair.current.operatingCF < 0) {
      comments.push("営業CFはプラスからマイナスへ転じており、運転資本や一時的支出の影響を確認したい状態です。");
    }
  }

  return comments.length > 0
    ? comments.join(" ")
    : "直近2期で大きな転換は確認されていません。利益率と営業CFの方向性を継続して確認します。";
}

export async function GET(_req: Request, { params }: RouteProps) {
  if (!(await isProUser())) {
    return NextResponse.json({ error: "Pro subscription required" }, { status: 403 });
  }

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
  const history = (data.history ?? []) as HistoryRow[];
  const score = num(data.score);
  const dangerScore = num(data.danger_score);
  const revenueGrowth = num(financials.revenueGrowth);
  const grossProfitGrowth = num(financials.grossProfitGrowth);
  const operatingMargin = num(financials.operatingMargin);
  const operatingCFMargin = num(financials.operatingCFMargin ?? financials.ocfMargin);
  const operatingIncome = num(financials.operatingIncome);
  const operatingCF = num(financials.operatingCF);
  const equityRatio = num(financials.equityRatio);
  const cashRatio = num(financials.cashRatio);

  const freePreview = [
    score !== null ? `総合スコアは${score}点です。` : "総合スコアは確認中です。",
    revenueGrowth !== null ? `売上成長率は${pct(revenueGrowth)}です。` : "売上成長率はデータ取得中です。",
    dangerScore !== null ? `Danger Scoreは${dangerScore}点です。` : "Danger Scoreは確認中です。",
  ];

  const namedRisks = riskFlags.slice(0, 4).map(riskTitle);
  const lockedInsights = [
    {
      title: "成長の質",
      detail: buildGrowthQuality(revenueGrowth, grossProfitGrowth, operatingMargin),
    },
    {
      title: "利益の質・キャッシュ",
      detail: buildCashQuality(operatingMargin, operatingCFMargin, operatingIncome, operatingCF),
    },
    {
      title: "財務耐久力",
      detail: buildFinancialDurability(equityRatio, cashRatio),
    },
    {
      title: "前期からの変化",
      detail: buildTrendInsight(history),
    },
    {
      title: "リスクの重なり",
      detail:
        namedRisks.length >= 2
          ? `${namedRisks.join("、")}が同時に検出されています。単独の指標ではなく、複数リスクが重なっている点を優先して確認します。`
          : namedRisks.length === 1
            ? `${namedRisks[0]}が検出されています。関連する注記や資金調達条件を確認します。`
            : "現時点で重大なリスクシグナルは限定的です。ただし、希薄化・継続企業注記・監査関連の更新は継続確認します。",
    },
  ];

  return NextResponse.json({
    ticker: data.ticker,
    companyName: data.company_name,
    generatedBy: "accounting-rules-v2",
    freePreview,
    lockedInsights,
    cta: "Proで詳細分析を見る",
    disclaimer: "Pro分析は決算データの理解補助であり、個別銘柄の売買判断や将来業績を示すものではありません。",
  });
}
