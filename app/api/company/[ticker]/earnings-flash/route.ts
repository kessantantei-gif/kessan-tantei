import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteProps = {
  params: Promise<{ ticker: string }>;
};

type HistoryRow = {
  year?: string | number;
  fiscalYear?: string | number;
  fiscalMonth?: string | number;
  fiscalPeriod?: string;
  fiscal_period?: string;
  period?: string;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  operatingCF?: number | null;
  netIncome?: number | null;
};

type CompanyRow = {
  ticker: string;
  company_name: string;
  score: number | null;
  danger_score: number | null;
  history: HistoryRow[] | null;
  financials: Record<string, number | null | undefined> | null;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function year(row: HistoryRow) {
  const value = Number(row.fiscalYear ?? row.year);
  return Number.isFinite(value) ? value : null;
}

function period(row: HistoryRow) {
  return row.fiscalPeriod ?? row.fiscal_period ?? row.period ?? (year(row) ? `${year(row)}年` : "不明");
}

function pctChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function amountChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

function pct(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function yen(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`;
}

function buildChange(label: string, current: number | null, previous: number | null, type: "pct" | "amount" = "pct") {
  const change = type === "pct" ? pctChange(current, previous) : amountChange(current, previous);
  const direction = change === null ? "neutral" : change > 0 ? "up" : change < 0 ? "down" : "flat";
  return {
    label,
    current,
    previous,
    change,
    direction,
    display: type === "pct" ? pct(change) : yen(change),
  };
}

function makeSummary(companyName: string, changes: ReturnType<typeof buildChange>[]) {
  const revenue = changes.find((item) => item.label === "売上高");
  const op = changes.find((item) => item.label === "営業利益");
  const cf = changes.find((item) => item.label === "営業CF");

  const texts: string[] = [];
  if (revenue?.direction === "up") texts.push("売上は前期比で増加しています。");
  if (revenue?.direction === "down") texts.push("売上は前期比で減少しています。");
  if (op?.direction === "up") texts.push("営業利益は改善しています。");
  if (op?.direction === "down") texts.push("営業利益は悪化しています。");
  if (cf?.direction === "up") texts.push("営業CFは改善しており、キャッシュ面は前期より良化しています。");
  if (cf?.direction === "down") texts.push("営業CFは前期より悪化しており、資金流出には注意が必要です。");

  if (texts.length === 0) return `${companyName}の直近期と前期の差分を確認できます。主要指標の変化を個別に確認してください。`;
  return `${companyName}の決算速報です。${texts.join("")}`;
}

export async function GET(_req: Request, { params }: RouteProps) {
  const { ticker } = await params;

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, score, danger_score, history, financials")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const company = data as CompanyRow;
  const history = [...(company.history ?? [])]
    .filter((row) => year(row) !== null)
    .sort((a, b) => Number(year(a)) - Number(year(b)));

  if (history.length < 2) {
    return NextResponse.json({
      ticker: company.ticker,
      companyName: company.company_name,
      enoughData: false,
      summary: "前期比較に必要な2期分以上のデータがまだ不足しています。",
      changes: [],
      disclaimer: "速報表示は決算データの理解補助であり、個別銘柄の売買判断を示すものではありません。",
    });
  }

  const previous = history[history.length - 2];
  const current = history[history.length - 1];
  const changes = [
    buildChange("売上高", num(current.revenue), num(previous.revenue), "pct"),
    buildChange("売上総利益", num(current.grossProfit), num(previous.grossProfit), "pct"),
    buildChange("営業利益", num(current.operatingIncome), num(previous.operatingIncome), "amount"),
    buildChange("営業CF", num(current.operatingCF), num(previous.operatingCF), "amount"),
    buildChange("純利益", num(current.netIncome), num(previous.netIncome), "amount"),
  ];

  const improved = changes.filter((item) => item.direction === "up").map((item) => item.label);
  const worsened = changes.filter((item) => item.direction === "down").map((item) => item.label);

  return NextResponse.json({
    ticker: company.ticker,
    companyName: company.company_name,
    enoughData: true,
    currentPeriod: period(current),
    previousPeriod: period(previous),
    score: company.score ?? null,
    dangerScore: company.danger_score ?? null,
    summary: makeSummary(company.company_name, changes),
    improved,
    worsened,
    changes,
    watchPoint:
      worsened.length > improved.length
        ? "悪化項目が多いため、会社ページの推移表とキャッシュフローを確認してください。"
        : "改善項目が多い一方で、営業CFと利益の整合性も確認してください。",
    disclaimer: "速報表示は決算データの理解補助であり、個別銘柄の売買判断を示すものではありません。",
  });
}
