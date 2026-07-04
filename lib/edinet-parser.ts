import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

type Financials = {
  revenue: number;
  operatingIncome: number;
  operatingCF: number;
  cash: number;
  currentAssets: number;
  currentLiabilities: number;
  assets: number;
  netAssets: number;
};

export function parseEdinetFinancials(docID: string): Financials {
  const zipPath = path.join(process.cwd(), "downloads", `${docID}.zip`);

  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP not found: ${zipPath}`);
  }

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  const xbrlEntry = entries.find(
    (entry) =>
      entry.entryName.startsWith("XBRL/PublicDoc/") &&
      entry.entryName.endsWith(".xbrl")
  );

  const htmEntry = entries.find(
    (entry) =>
      entry.entryName.startsWith("XBRL/PublicDoc/") &&
      entry.entryName.includes("_ixbrl.htm")
  );

  const fromXbrl = xbrlEntry
    ? parseStandardXbrl(xbrlEntry.getData().toString("utf8"))
    : emptyFinancials();

  const fromInline = htmEntry
    ? parseInlineXbrl(htmEntry.getData().toString("utf8"))
    : emptyFinancials();

  return mergeFinancials(fromXbrl, fromInline);
}

function emptyFinancials(): Financials {
  return {
    revenue: 0,
    operatingIncome: 0,
    operatingCF: 0,
    cash: 0,
    currentAssets: 0,
    currentLiabilities: 0,
    assets: 0,
    netAssets: 0,
  };
}

function mergeFinancials(a: Financials, b: Financials): Financials {
  return {
    revenue: a.revenue || b.revenue,
    operatingIncome: a.operatingIncome || b.operatingIncome,
    operatingCF: a.operatingCF || b.operatingCF,
    cash: a.cash || b.cash,
    currentAssets: a.currentAssets || b.currentAssets,
    currentLiabilities: a.currentLiabilities || b.currentLiabilities,
    assets: a.assets || b.assets,
    netAssets: a.netAssets || b.netAssets,
  };
}

function parseStandardXbrl(text: string): Financials {
  function extractValue(tagNames: string[]): number {
    for (const tagName of tagNames) {
      const regex = new RegExp(
        `<${escapeRegExp(tagName)}[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(
          tagName
        )}>`,
        "g"
      );

      const matches = [...text.matchAll(regex)];
      if (matches.length === 0) continue;

      const raw = matches[matches.length - 1][1]
        .replace(/,/g, "")
        .trim();

      const num = Number(raw);
      if (!Number.isNaN(num)) return num;
    }
    return 0;
  }

  return {
    revenue: extractValue([
      "jppfs_cor:NetSales",
      "jppfs_cor:Sales",
      "jppfs_cor:Revenue",
      "jppfs_cor:OperatingRevenue",
      "jpcrp030000-asr_E39268-000:BusinessRevenue",
    ]),
    operatingIncome: extractValue([
      "jppfs_cor:OperatingIncome",
      "jppfs_cor:OperatingProfit",
    ]),
    operatingCF: extractValue([
      "jppfs_cor:NetCashProvidedByUsedInOperatingActivities",
    ]),
    cash: extractValue(["jppfs_cor:CashAndCashEquivalents"]),
    currentAssets: extractValue(["jppfs_cor:CurrentAssets"]),
    currentLiabilities: extractValue(["jppfs_cor:CurrentLiabilities"]),
    assets: extractValue(["jppfs_cor:Assets", "jppfs_cor:TotalAssets"]),
    netAssets: extractValue(["jppfs_cor:NetAssets"]),
  };
}

function parseInlineXbrl(text: string): Financials {
  function extractByName(keywords: string[]): number {
    const regex =
      /<ix:nonFraction([^>]*)>([\s\S]*?)<\/ix:nonFraction>/g;

    let match;

    while ((match = regex.exec(text)) !== null) {
      const attrs = match[1];
      const valueText = match[2].replace(/<[^>]+>/g, "").trim();

      const nameMatch = attrs.match(/name="([^"]+)"/);
      if (!nameMatch) continue;

      const name = nameMatch[1];

      if (!keywords.some((k) => name.endsWith(k))) continue;

      let value = Number(valueText.replace(/,/g, ""));
      if (Number.isNaN(value)) continue;

      const decimalsMatch = attrs.match(/decimals="([^"]+)"/);

      if (decimalsMatch?.[1] === "-3") {
        value *= 1000;
      }

      return value;
    }

    return 0;
  }

  return {
    revenue: extractByName([
      "NetSales",
      "Sales",
      "Revenue",
      "OperatingRevenue",
      "BusinessRevenue",
    ]),
    operatingIncome: extractByName([
      "OperatingIncome",
      "OperatingProfit",
    ]),
    operatingCF: extractByName([
      "NetCashProvidedByUsedInOperatingActivities",
    ]),
    cash: extractByName(["CashAndCashEquivalents"]),
    currentAssets: extractByName(["CurrentAssets"]),
    currentLiabilities: extractByName(["CurrentLiabilities"]),
    assets: extractByName(["Assets", "TotalAssets"]),
    netAssets: extractByName(["NetAssets"]),
  };
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}