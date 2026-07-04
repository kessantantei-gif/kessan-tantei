import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function fetchHistory() {
  const apiKey = process.env.EDINET_API_KEY;
  const companyName = process.env.COMPANY_NAME;

  if (!apiKey) throw new Error("EDINET_API_KEY missing");
  if (!companyName) throw new Error("COMPANY_NAME missing");

  const results = [];
  let date = new Date();

  while (results.length < 3) {
    const targetDate = date.toISOString().split("T")[0];

    const url =
      `https://api.edinet-fsa.go.jp/api/v2/documents.json` +
      `?date=${targetDate}&type=2&Subscription-Key=${apiKey}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      const docs = (data.results || []).filter(
        (doc: any) =>
          doc.filerName?.includes(companyName) &&
          doc.docDescription?.includes("有価証券報告書")
      );

      docs.forEach((doc: any) => {
        if (!results.find((r: any) => r.docID === doc.docID)) {
          results.push({
            docID: doc.docID,
            filerName: doc.filerName,
            date: targetDate,
          });
        }
      });
    } catch {}

    date.setDate(date.getDate() - 1);

    if (date.getFullYear() < 2018) break;
  }

  console.table(results);
}

fetchHistory();