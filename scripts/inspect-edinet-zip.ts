import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

const docID = process.env.DOC_ID || "S100YEU4";

const zipPath = path.join(process.cwd(), "downloads", `${docID}.zip`);

if (!fs.existsSync(zipPath)) {
  throw new Error(`ZIPが見つかりません: ${zipPath}`);
}

const zip = new AdmZip(zipPath);
const entries = zip.getEntries();

console.log("===== ZIP中身確認 =====");
console.log("docID:", docID);
console.log("ファイル数:", entries.length);

console.log("===== XBRL / XML / CSV候補 =====");

entries
  .filter((entry) => {
    const name = entry.entryName.toLowerCase();
    return (
      name.endsWith(".xbrl") ||
      name.endsWith(".xml") ||
      name.endsWith(".csv")
    );
  })
  .slice(0, 50)
  .forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.entryName}`);
  });