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

console.log("===== XBRLファイル確認 =====");
console.log("docID:", docID);
console.log("XBRL:", xbrlEntry.entryName);
console.log("文字数:", xbrlText.length);

const tagMatches = [...xbrlText.matchAll(/<([a-zA-Z0-9_:.-]+)\b/g)];

const tagNames = Array.from(
  new Set(
    tagMatches
      .map((match) => match[1])
      .filter((tag) => !tag.startsWith("/"))
  )
);

console.log("タグ種類数:", tagNames.length);

const keywords = [
  "Revenue",
  "Sales",
  "OperatingIncome",
  "Profit",
  "Cash",
  "CurrentLiabilities",
  "Assets",
  "Equity",
  "NetAssets",
];

console.log("===== 重要そうなタグ =====");

const candidates = tagNames.filter((tag) =>
  keywords.some((keyword) =>
    tag.toLowerCase().includes(keyword.toLowerCase())
  )
);

candidates.slice(0, 200).forEach((tag, index) => {
  console.log(`${index + 1}. ${tag}`);
});