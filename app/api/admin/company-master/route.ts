import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-engine";
import { loadRuntimeCompanyMasterEntries } from "@/lib/company-master-runtime";
import { supabaseAdmin } from "@/lib/supabase";

type UpdatePayload = {
  ticker?: string;
  companyName?: string;
  theme?: string;
  subTheme?: string;
  businessModel?: string;
  marketCapClass?: string | null;
  rivalTickers?: string[];
  keywords?: string[];
};

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function invalidText(value: unknown) {
  return typeof value !== "string" || value.trim().length === 0;
}

export async function GET() {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const entries = await loadRuntimeCompanyMasterEntries();
  const reviewed = entries.filter((entry) => entry.reviewed).length;
  const automatic = entries.length - reviewed;
  const unclassified = entries.filter(
    (entry) => entry.themeId === "other" || entry.theme === "その他"
  ).length;

  return NextResponse.json({
    entries,
    summary: {
      total: entries.length,
      reviewed,
      automatic,
      unclassified,
    },
  });
}

export async function PATCH(request: Request) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: UpdatePayload;
  try {
    body = (await request.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (
    invalidText(body.ticker) ||
    invalidText(body.companyName) ||
    invalidText(body.theme) ||
    invalidText(body.subTheme) ||
    invalidText(body.businessModel)
  ) {
    return NextResponse.json({ error: "required fields are missing" }, { status: 400 });
  }

  const ticker = body.ticker!.trim().toUpperCase();
  const rivalTickers = cleanList(body.rivalTickers)
    .map((item) => item.toUpperCase())
    .filter((item) => item !== ticker);
  const keywords = cleanList(body.keywords);

  const { data, error } = await supabaseAdmin
    .from("company_master")
    .upsert(
      {
        ticker,
        company_name: body.companyName!.trim(),
        theme: body.theme!.trim(),
        sub_theme: body.subTheme!.trim(),
        business_model: body.businessModel!.trim(),
        market_cap_class: body.marketCapClass?.trim() || null,
        rival_tickers: rivalTickers,
        keywords,
        reviewed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ticker" }
    )
    .select(
      "ticker, company_name, theme, sub_theme, business_model, market_cap_class, rival_tickers, keywords, reviewed, updated_at"
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: "save failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ saved: true, row: data });
}
