import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

const docID = process.env.DOC_ID || "S100YEU4";

const zipPath = path.join(process.cwd(), "downloads", `${docID}.zip`);

if (!fs.existsSync(zipPath)) {
  throw new Error(`ZIPが見つかりません: ${zipPath}`);
}

const zip = new AdmZip(zipPath);

const xbrlEntry = zip
  .getEntries()
  .find(
    (entry) =>
      entry.entryName.startsWith("XBRL/PublicDoc/") &&
      entry.entryName.endsWith(".xbrl")
  );

if (!xbrlEntry) {
  throw new Error("PublicDocのXBRLファイルが見つかりません");
}

const xbrlText = xbrlEntry.getData().toString("utf8");

function extractValue(tagName: string): string | null {
  const regex = new RegExp(
    `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "g"
  );

  const matches = [...xbrlText.matchAll(regex)];

  if (matches.length === 0) return null;

  return matches[matches.length - 1][1].trim();
}

const items = [
  {
    label: "売上高",
    tag: "jppfs_cor:OperatingRevenueSEC",
  },
  {
    label: "営業利益",
    tag: "jppfs_cor:OperatingIncome",
  },
  {
    label: "営業CF",
    tag: "jppfs_cor:NetCashProvidedByUsedInOperatingActivities",
  },
  {
    label: "現金及び現金同等物",
    tag: "jppfs_cor:CashAndCashEquivalents",
  },
];

console.log("===== 財務数値抽出 =====");
console.log("docID:", docID);
console.log("XBRL:", xbrlEntry.entryName);

const results = items.map((item) => ({
  項目: item.label,
  タグ: item.tag,
  値: extractValue(item.tag),
}));

console.table(results);