import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteProps = {
  params: Promise<{ ticker: string }>;
};

function finiteKeys(row: Record<string, unknown> | null | undefined) {
  if (!row) return [];
  return Object.entries(row)
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    .map(([key]) => key)
    .sort();
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { ticker } = await params;
  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, doc_id, financials, history, updated_at")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const history = Array.isArray(data.history) ? data.history : [];
  return NextResponse.json({
    ticker: data.ticker,
    companyName: data.company_name,
    docId: data.doc_id,
    updatedAt: data.updated_at,
    historyCount: history.length,
    history: history.map((row: Record<string, unknown>, index: number) => ({
      index,
      year: row.year ?? null,
      fiscalYear: row.fiscalYear ?? null,
      periodEnd: row.periodEnd ?? null,
      finiteKeys: finiteKeys(row),
      revenue: row.revenue ?? null,
      operatingIncome: row.operatingIncome ?? null,
      operatingCF: row.operatingCF ?? null,
    })),
    financials: {
      fiscalYear: data.financials?.fiscalYear ?? null,
      periodEnd: data.financials?.periodEnd ?? null,
      finiteKeys: finiteKeys(data.financials),
      revenue: data.financials?.revenue ?? null,
      operatingIncome: data.financials?.operatingIncome ?? null,
      operatingCF: data.financials?.operatingCF ?? null,
      revenueGrowth: data.financials?.revenueGrowth ?? null,
      operatingIncomeGrowth: data.financials?.operatingIncomeGrowth ?? null,
      operatingCFGrowth: data.financials?.operatingCFGrowth ?? null,
    },
  });
}
