import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function fetchHistory() {
  const suppliedDocIds = (process.env.HISTORY_DOC_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^S100[A-Z0-9]+$/.test(value));

  if (suppliedDocIds.length > 0) {
    console.log("バックフィル走査済み履歴を使用:", suppliedDocIds.join(", "));
    for (const docID of suppliedDocIds) console.log(docID);
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
