import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SAME_PERIOD_CORRECTION_ONLY_DOC_IDS = new Set([
  "S100XANE",
  "S100YDH5",
]);

async function fetchHistory() {
  const latestDocID = (process.env.DOC_ID ?? "").trim();
  const suppliedDocIds = (process.env.HISTORY_DOC_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^S100[A-Z0-9]+$/.test(value));

  if (suppliedDocIds.length > 0) {
    // この2件は候補がすべて同一決算期の訂正系列。
    // 最新書類だけを履歴入力へ渡し、古い訂正系列で代表書類が落ちるのを防ぐ。
    if (latestDocID && SAME_PERIOD_CORRECTION_ONLY_DOC_IDS.has(latestDocID)) {
      console.log("同一決算期の訂正系列につき最新書類のみ使用:", latestDocID);
      console.log(latestDocID);
      return;
    }

    // analyze-company.ts は同一決算期で最初に現れた書類を保持する。
    // 最新書類を必ず先頭に置き、その後に残りの候補を渡す。
    const newestFirst = Array.from(
      new Set([
        ...(latestDocID ? [latestDocID] : []),
        ...suppliedDocIds.filter((docID) => docID !== latestDocID),
      ])
    );

    console.log("バックフィル走査済み履歴を使用（最新書類優先）:", newestFirst.join(", "));
    for (const docID of newestFirst) console.log(docID);
    return;
  }

  const apiKey = process.env.EDINET_API_KEY;
  const companyName = process.env.COMPANY_NAME;

  if (!apiKey) throw new Error("EDINET_API_KEY missing");
  if (!companyName) throw new Error("COMPANY_NAME missing");

  throw new Error(
    "HISTORY_DOC_IDS がありません。日付総当たり検索はレート制限防止のため停止しました。"
  );
}

fetchHistory().catch((error) => {
  console.error(error);
  process.exit(1);
});
