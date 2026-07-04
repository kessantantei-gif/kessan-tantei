import fs from "fs";
import path from "path";
import { supabaseAdmin } from "../lib/supabase";

type GrowthCompany = {
  ticker: string;
  name: string;
  market: string;
  sector33: string;
  sector17: string;
  edinetHint: string;
  edinetCode?: string | null;
  edinetFilerName?: string | null;
  edinetSecCode?: string | null;
};

async function main() {
  const filePath = path.join(process.cwd(), "data", "growth-companies.json");

  if (!fs.existsSync(filePath)) {
    throw new Error("data/growth-companies.json が見つかりません");
  }

  const companies = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  ) as GrowthCompany[];

  const rows = companies.map((company) => ({
    ticker: company.ticker,
    name: company.name,
    market: company.market,
    sector33: company.sector33,
    sector17: company.sector17,
    edinet_hint: company.edinetHint,
    edinet_code: company.edinetCode ?? null,
    edinet_filer_name: company.edinetFilerName ?? null,
    edinet_sec_code: company.edinetSecCode ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("companies")
    .upsert(rows, { onConflict: "ticker" });

  if (error) {
    throw error;
  }

  console.log("===== Import Growth Companies Done =====");
  console.log("Imported:", rows.length);
}

main().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
  process.exit(1);
});