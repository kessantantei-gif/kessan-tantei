import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

type GrowthCompany = {
  ticker: string;
  name: string;
  market: string;
  sector33: string;
  sector17: string;
  edinetHint: string;
  edinetCode?: string | null;
  edinetFilerName?: string | null;
  edinetMatchedDocID?: string | null;
  edinetMatchedDate?: string | null;
  edinetSecCode?: string | null;
};

type EdinetDoc = {
  docID: string;
  edinetCode?: string;
  secCode?: string;
  filerName?: string;
  docDescription?: string;
};

function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/株式会社/g, "")
    .replace(/\(株\)/g, "")
    .replace(/ホールディングス/g, "")
    .replace(/HD/g, "")
    .replace(/ＨＤ/g, "")
    .replace(/グループ/g, "")
    .replace(/[ 　・.．,，、()（）]/g, "")
    .toLowerCase()
    .trim();
}

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function tickerMatchesSecCode(ticker: string, secCode?: string) {
  if (!secCode) return false;

  const normalizedTicker = ticker.trim().toUpperCase();
  const normalizedSecCode = secCode.trim().toUpperCase();

  return normalizedSecCode.startsWith(normalizedTicker);
}

async function fetchDocumentsByDate(date: string, apiKey: string) {
  const url =
    `https://api.edinet-fsa.go.jp/api/v2/documents.json` +
    `?date=${date}&type=2&Subscription-Key=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`EDINET API Error ${response.status}: ${date}`);
  }

  const data = await response.json();
  return (data.results || []) as EdinetDoc[];
}

async function main() {
  const apiKey = process.env.EDINET_API_KEY;
  const days = Number(process.env.DAYS || 460);

  if (!apiKey) {
    throw new Error("EDINET_API_KEY が設定されていません");
  }

  const masterPath = path.join(process.cwd(), "data", "growth-companies.json");

  if (!fs.existsSync(masterPath)) {
    throw new Error("data/growth-companies.json が見つかりません");
  }

  const companies = JSON.parse(
    fs.readFileSync(masterPath, "utf8")
  ) as GrowthCompany[];

  console.log("===== EDINET Code Sync Start =====");
  console.log("Growth companies:", companies.length);
  console.log("Scan days:", days);

  const annualDocs: {
    edinetCode: string;
    secCode: string | null;
    filerName: string;
    normalizedName: string;
    docID: string;
    date: string;
  }[] = [];

  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const targetDate = formatDate(date);

    try {
      const docs = await fetchDocumentsByDate(targetDate, apiKey);

      for (const doc of docs) {
        if (!doc.edinetCode || !doc.filerName) continue;

        const isAnnualReport =
          doc.docDescription?.includes("有価証券報告書") ?? false;

        if (!isAnnualReport) continue;

        annualDocs.push({
          edinetCode: doc.edinetCode,
          secCode: doc.secCode ?? null,
          filerName: doc.filerName,
          normalizedName: normalizeName(doc.filerName),
          docID: doc.docID,
          date: targetDate,
        });
      }

      if (i % 30 === 0) {
        console.log(`scanned ${i + 1}/${days}: ${targetDate}`);
      }
    } catch {
      console.log("scan skipped:", targetDate);
    }
  }

  console.log("Annual docs:", annualDocs.length);

  const enriched = companies.map((company) => {
    const companyNameKey = normalizeName(company.name);
    const companyHintKey = normalizeName(company.edinetHint);

    const secCodeMatched = annualDocs.find((doc) =>
      tickerMatchesSecCode(company.ticker, doc.secCode ?? undefined)
    );

    const strictNameMatched =
      secCodeMatched ??
      annualDocs.find((doc) => {
        return (
          doc.normalizedName === companyNameKey ||
          doc.normalizedName === companyHintKey
        );
      });

    return {
      ...company,
      edinetCode: strictNameMatched?.edinetCode ?? null,
      edinetFilerName: strictNameMatched?.filerName ?? null,
      edinetMatchedDocID: strictNameMatched?.docID ?? null,
      edinetMatchedDate: strictNameMatched?.date ?? null,
      edinetSecCode: strictNameMatched?.secCode ?? null,
    };
  });

  const matchedCount = enriched.filter((company) => company.edinetCode).length;
  const unmatched = enriched.filter((company) => !company.edinetCode);

  fs.writeFileSync(masterPath, JSON.stringify(enriched, null, 2));

  const unmatchedPath = path.join(
    process.cwd(),
    "data",
    "growth-companies-unmatched.json"
  );

  fs.writeFileSync(unmatchedPath, JSON.stringify(unmatched, null, 2));

  console.log("Matched:", matchedCount);
  console.log("Unmatched:", unmatched.length);
  console.log("Updated:", masterPath);
  console.log("Unmatched saved:", unmatchedPath);

  console.table(
    enriched.slice(0, 30).map((company) => ({
      ticker: company.ticker,
      name: company.name,
      secCode: company.edinetSecCode,
      edinetCode: company.edinetCode,
      edinetFilerName: company.edinetFilerName,
    }))
  );

  console.log("===== EDINET Code Sync Done =====");
}

main().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
  process.exit(1);
});