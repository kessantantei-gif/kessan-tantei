import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ ticker: string }>;
};

export async function GET(_req: Request, { params }: RouteContext) {
  const { ticker } = await params;

  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("ticker, company_name, history")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed_to_load_history" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const history = Array.isArray(data.history)
    ? [...data.history].sort((a: any, b: any) => Number(a.year ?? 0) - Number(b.year ?? 0))
    : [];

  return NextResponse.json({
    ticker: data.ticker,
    company_name: data.company_name,
    history,
  });
}
