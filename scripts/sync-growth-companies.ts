import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

const JPX_URL =
  "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls";

type GrowthCompany = {
  ticker: string;
  name: string;
  market: string;
  sector33: string;
  sector17: string;
  edinetHint: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

async function main() {
  console.log("===== Growth Companies Sync Start =====");

  const res = await fetch(JPX_URL);
  if (!res.ok) throw new Error(`JPX download failed: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });

  let allRows: Record<string, unknown>[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    if (rows.length > allRows.length) {
      allRows = rows;
    }
  }

  console.log("読み取り行数:", allRows.length);

  const markets = Array.from(
    new Set(allRows.map((row) => clean(row["市場・商品区分"])).filter(Boolean))
  );

  console.log("市場区分一覧:");
  console.table(markets);

  const growthCompanies: GrowthCompany[] = allRows
    .map((row) => {
      const ticker = clean(row["コード"]);
      const name = clean(row["銘柄名"]);
      const market = clean(row["市場・商品区分"]);
      const sector33 = clean(row["33業種区分"]);
      const sector17 = clean(row["17業種区分"]);

      return {
        ticker,
        name,
        market,
        sector33,
        sector17,
        edinetHint: name
          .replace(/株式会社/g, "")
          .replace(/ＨＤ/g, "")
          .replace(/ホールディングス/g, "")
          .replace(/グループ/g, "")
          .trim(),
      };
    })
    .filter((company) => {
      return (
        company.ticker &&
        company.name &&
        company.market.includes("グロース")
      );
    });

  growthCompanies.sort((a, b) => a.ticker.localeCompare(b.ticker));

  const outputDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "growth-companies.json");
  fs.writeFileSync(outputPath, JSON.stringify(growthCompanies, null, 2));

  console.log("Growth companies:", growthCompanies.length);
  console.log("Saved:", outputPath);
  console.table(growthCompanies.slice(0, 30));
  console.log("===== Growth Companies Sync Done =====");
}

main().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
  process.exit(1);
});