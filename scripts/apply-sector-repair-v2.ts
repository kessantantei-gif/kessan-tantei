import fs from "fs";
import { execFileSync } from "child_process";

const target = "scripts/repair-sector-financials.ts";
let source = fs.readFileSync(target, "utf8");

function replaceOnce(from: string, to: string) {
  if (!source.includes(from)) throw new Error(`置換対象が見つかりません: ${from.slice(0, 80)}`);
  source = source.replace(from, to);
}

replaceOnce(
  `.filter((entry) => entry.entryName.startsWith("XBRL/PublicDoc/") && /\\.(xbrl|htm)$/i.test(entry.entryName))`,
  `.filter((entry) => !entry.isDirectory && /\\.(xbrl|xml|htm|html)$/i.test(entry.entryName))`
);

replaceOnce(
  `contains: ["ordinaryprofit"],`,
  `contains: ["ordinaryprofit", "profitbeforeincometax", "incomebeforeincometaxes", "profitbeforetax", "netincome", "profitlossattributabletoownersofparent"],`
);

replaceOnce(
  `contains: ["revenue", "netsales", "salesrevenue"],`,
  `contains: ["revenue", "netsales", "salesrevenue", "operatingrevenue", "businessrevenue", "businessincome", "licenseincome", "licenserevenue", "researchrevenue", "grantrevenue"],`
);

replaceOnce(
  `exact: ["OrdinaryProfit", "OrdinaryProfitLoss"],`,
  `exact: ["OrdinaryProfit", "OrdinaryProfitLoss", "OrdinaryProfitLossBanking", "ProfitBeforeIncomeTaxes", "IncomeBeforeIncomeTaxes", "ProfitBeforeTax", "NetIncome", "NetIncomeLoss", "ProfitLossAttributableToOwnersOfParent"],`
);

replaceOnce(
  `const latest = extractDocument(row.doc_id, profile);\n      const latestMissing = unresolvedFields(latest as unknown as Record<string, unknown>, profile);\n      if (latestMissing.length > 0) {\n        throw new Error(\`原本から必須項目を取得できません: \${latestMissing.join(", ")}\`);\n      }`,
  `const candidateDocIDs = Array.from(new Set([\n        row.doc_id,\n        ...(row.history ?? []).map((item) => String(item.docID ?? item.documentId ?? "")),\n      ].filter(Boolean)));\n\n      let latest: ReturnType<typeof extractDocument> | null = null;\n      let sourceDocumentId = row.doc_id;\n      let smallestMissing = Number.POSITIVE_INFINITY;\n      const diagnostics: Array<{ docID: string; missing: string[]; error?: string }> = [];\n\n      for (const candidateDocID of candidateDocIDs) {\n        try {\n          const candidate = extractDocument(candidateDocID, profile);\n          const candidateMissing = unresolvedFields(candidate as unknown as Record<string, unknown>, profile);\n          diagnostics.push({ docID: candidateDocID, missing: candidateMissing });\n          if (candidateMissing.length < smallestMissing) {\n            latest = candidate;\n            sourceDocumentId = candidateDocID;\n            smallestMissing = candidateMissing.length;\n          }\n          if (candidateMissing.length === 0) break;\n        } catch (candidateError) {\n          diagnostics.push({\n            docID: candidateDocID,\n            missing: requiredFields(profile),\n            error: candidateError instanceof Error ? candidateError.message : String(candidateError),\n          });\n        }\n      }\n\n      if (!latest || smallestMissing > 0) {\n        throw new Error(\`全候補書類で必須項目を取得できません: \${JSON.stringify(diagnostics)}\`);\n      }\n\n      latest = { ...latest, sourceDocumentId } as typeof latest;`
);

replaceOnce(
  `.eq("document_id", row.doc_id);`,
  `.eq("document_id", String((latest as Record<string, unknown>).sourceDocumentId ?? row.doc_id));`
);

fs.writeFileSync(target, source);
console.log("repair-sector-financials.ts にv2修正を適用しました");

const report = process.argv.find((arg) => arg.startsWith("--report="));
const concurrency = process.argv.find((arg) => arg.startsWith("--concurrency=")) ?? "--concurrency=2";
if (!report) throw new Error("--report が必要です");

execFileSync("npx", ["tsx", target, report, concurrency], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});
