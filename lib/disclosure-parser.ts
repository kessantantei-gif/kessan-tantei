import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

export type AuditFirmType = "big4" | "midSmall" | "unknown";

export type DisclosureSignals = {
  goingConcern: boolean;
  msWarrant: boolean;
  convertibleBond: boolean;
  equityFinancing: boolean;
  previousAuditorName: string;
  currentAuditorName: string;
};

export function classifyAuditor(name?: string | null): AuditFirmType {
  const text = normalize(name || "");
  if (!text) return "unknown";

  const big4Keywords = [
    "有限責任あずさ監査法人",
    "あずさ監査法人",
    "有限責任監査法人トーマツ",
    "監査法人トーマツ",
    "ey新日本有限責任監査法人",
    "新日本有限責任監査法人",
    "pwc japan有限責任監査法人",
    "pwcあらた有限責任監査法人",
    "pwc京都監査法人",
  ].map(normalize);

  if (big4Keywords.some((keyword) => text.includes(keyword))) return "big4";
  if (text.includes("監査法人")) return "midSmall";
  return "unknown";
}

export function hasAuditorChanged(signals: DisclosureSignals) {
  const previous = normalize(signals.previousAuditorName);
  const current = normalize(signals.currentAuditorName);
  return Boolean(previous && current && previous !== current);
}

export function parseDisclosureSignals(docID: string): DisclosureSignals {
  const rawText = readEdinetText(docID);
  return parseDisclosureSignalsFromText(rawText, docID);
}

export function parseDisclosureSignalsFromBuffer(buffer: Buffer): DisclosureSignals {
  const zip = new AdmZip(buffer);
  const rawText = zip
    .getEntries()
    .filter(
      (entry) =>
        !entry.entryName.includes("/fuzoku/") &&
        /\.(xbrl|html?|xml)$/i.test(entry.entryName)
    )
    .map((entry) => entry.getData().toString("utf8"))
    .join("\n");

  return parseDisclosureSignalsFromText(rawText, "buffer");
}

function parseDisclosureSignalsFromText(rawText: string, source: string): DisclosureSignals {
  const text = normalize(rawText);

  const goingConcern = detectGoingConcern(text);
  const msWarrant = detectMsWarrant(text);
  const convertibleBond = detectConvertibleBond(text);
  const equityFinancing = detectDangerousEquityFinancing(text);

  if (process.env.DEBUG_DISCLOSURE === "1") {
    console.log("===== Disclosure Debug =====");
    console.log("source:", source);
    console.log("goingConcern:", goingConcern);
    console.log("msWarrant:", msWarrant);
    console.log("convertibleBond:", convertibleBond);
    console.log("equityFinancing:", equityFinancing);
    console.log("============================");
  }

  return {
    goingConcern,
    msWarrant,
    convertibleBond,
    equityFinancing,
    previousAuditorName: extractPreviousAuditorName(rawText),
    currentAuditorName: extractCurrentAuditorName(rawText),
  };
}

function readEdinetText(docID: string): string {
  const zipPath = path.join(process.cwd(), "downloads", `${docID}.zip`);
  if (!fs.existsSync(zipPath)) throw new Error(`ZIP not found: ${zipPath}`);

  const zip = new AdmZip(zipPath);

  return zip
    .getEntries()
    .filter(
      (entry) =>
        entry.entryName.startsWith("XBRL/PublicDoc/") &&
        !entry.entryName.includes("/fuzoku/") &&
        (entry.entryName.endsWith(".xbrl") ||
          entry.entryName.endsWith(".htm") ||
          entry.entryName.endsWith(".html") ||
          entry.entryName.endsWith(".xml"))
    )
    .map((entry) => entry.getData().toString("utf8"))
    .join("\n");
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;[^&]+&gt;/g, " ")
    .replace(/&lt;|&gt;|&quot;|&amp;/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function debugHit(label: string, keyword: string, around: string) {
  if (process.env.DEBUG_DISCLOSURE !== "1") return;
  console.log(`\n[${label}]`);
  console.log("keyword:", keyword);
  console.log("around:", around.slice(0, 1000));
}

function detectGoingConcern(text: string): boolean {
  if (!text.includes("継続企業の前提")) return false;

  const index = text.indexOf(normalize("継続企業の前提"));
  const around = text.slice(Math.max(0, index - 300), index + 800);

  const negativePatterns = [
    "継続企業の前提に関する重要事象等はありません",
    "継続企業の前提に関する注記に該当事項はありません",
    "該当事項はありません",
    "該当事項はございません",
  ].map(normalize);

  if (negativePatterns.some((pattern) => around.includes(pattern))) {
    return false;
  }

  const hit =
    around.includes(normalize("重要な疑義")) ||
    around.includes(normalize("重要事象等")) ||
    around.includes(normalize("継続企業の前提に関する注記"));

  if (hit) debugHit("goingConcern", "継続企業の前提", around);
  return hit;
}

function detectMsWarrant(text: string): boolean {
  const keywords = [
    "行使価額修正条項付新株予約権",
    "行使価額修正条項付新株予約権付社債",
    "msワラント",
    "movingstrikewarrant",
  ].map(normalize);

  return hasPositiveSignal("msWarrant", text, keywords);
}

function detectConvertibleBond(text: string): boolean {
  const keywords = [
    "転換社債型新株予約権付社債",
    "転換社債",
    "新株予約権付社債",
  ].map(normalize);

  return hasPositiveSignal("convertibleBond", text, keywords);
}

function detectDangerousEquityFinancing(text: string): boolean {
  const dangerousKeywords = [
    "第三者割当による新株式の発行",
    "第三者割当増資",
    "第三者割当による新株予約権の発行",
    "第三者割当により発行される新株予約権",
    "第三者割当による資金調達",
    "ライツ・オファリング",
    "株主割当増資",
    "デット・エクイティ・スワップ",
    "desによる新株式発行",
  ].map(normalize);

  const ipoSafeKeywords = [
    "新規上場",
    "東京証券取引所グロース市場への上場",
    "上場に伴う",
    "オーバーアロットメント",
    "公募による新株式の発行",
    "売出し",
  ].map(normalize);

  const isLikelyIpoDocument = ipoSafeKeywords.some((safe) =>
    text.includes(safe)
  );

  for (const keyword of dangerousKeywords) {
    let start = 0;

    while (true) {
      const index = text.indexOf(keyword, start);
      if (index === -1) break;

      const around = text.slice(Math.max(0, index - 3000), index + 3000);

      const localIpoSafe = ipoSafeKeywords.some((safe) =>
        around.includes(safe)
      );

      if (isLikelyIpoDocument || localIpoSafe) {
        start = index + keyword.length;
        continue;
      }

      debugHit("equityFinancing", keyword, around);
      return true;
    }
  }

  return false;
}

function hasPositiveSignal(
  label: string,
  text: string,
  keywords: string[]
): boolean {
  const negativePatterns = [
    "該当事項はありません",
    "該当事項はございません",
    "該当ありません",
    "該当事項なし",
    "発行しておりません",
    "行使状況等該当事項はありません",
    "行使状況等該当事項はございません",
    "その他の新株予約権等の状況該当事項はございません",
    "ライツプランの内容該当事項はございません",
  ].map(normalize);

  const safeStockOptionWords = [
    "ストックオプション",
    "付与対象者",
    "当社取締役",
    "当社従業員",
    "権利行使可能",
  ].map(normalize);

  for (const keyword of keywords) {
    let start = 0;

    while (true) {
      const index = text.indexOf(keyword, start);
      if (index === -1) break;

      const around = text.slice(Math.max(0, index - 1200), index + 2000);

      const isNegative = negativePatterns.some((negative) =>
        around.includes(negative)
      );

      const isStockOptionOnly =
        safeStockOptionWords.some((safe) => around.includes(safe)) &&
        around.includes(normalize("新株予約権"));

      if (!isNegative && !isStockOptionOnly) {
        debugHit(label, keyword, around);
        return true;
      }

      start = index + keyword.length;
    }
  }

  return false;
}

function extractPreviousAuditorName(rawText: string): string {
  const text = rawText.replace(/<[^>]+>/g, " ");
  const match = text.match(/異動前[^。]{0,80}(監査法人[^。\n\r]*)/);
  return match?.[1]?.trim() || "";
}

function extractCurrentAuditorName(rawText: string): string {
  const text = rawText.replace(/<[^>]+>/g, " ");
  const match = text.match(/異動後[^。]{0,80}(監査法人[^。\n\r]*)/);
  return match?.[1]?.trim() || "";
}
