import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function fetchEdinet() {
  const apiKey = process.env.EDINET_API_KEY;

  if (!apiKey) {
    throw new Error("EDINET_API_KEY が設定されていません");
  }

  const targetDate =
    process.env.EDINET_DATE || new Date().toISOString().split("T")[0];

  const companyName = process.env.COMPANY_NAME;

  const url =
    `https://api.edinet-fsa.go.jp/api/v2/documents.json` +
    `?date=${targetDate}&type=2&Subscription-Key=${apiKey}`;

  console.log("===== EDINET接続開始 =====");
  console.log("対象日:", targetDate);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();

  let results = data.results || [];

  if (companyName) {
    results = results.filter((doc: any) =>
      doc.filerName?.toLowerCase().includes(companyName.toLowerCase())
    );
  }

  console.log("総件数:", data.results?.length || 0);
  console.log("抽出件数:", results.length);

  if (results.length > 0) {
    console.table(
      results.slice(0, 20).map((doc: any) => ({
        docID: doc.docID,
        filerName: doc.filerName,
        docDescription: doc.docDescription,
      }))
    );
  } else {
    console.log("該当企業なし");
  }
}

fetchEdinet().catch((error) => {
  console.error("エラー発生:");
  console.error(error);
});