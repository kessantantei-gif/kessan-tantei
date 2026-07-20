import "dotenv/config";
import { spawn } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";
import { loadAllSupabaseRows } from "../lib/load-all-supabase-rows";

type FinancialCompany = {
  ticker: string;
  company_name: string;
};

type StoredFinancials = {
  revenue?: number | null;
  financialProfile?: string;
  revenueLabel?: string;
  operatingIncomeLabel?: string;
  currentRatioApplicable?: boolean;
};

type AnalysisRow = {
  ticker: string;
  doc_id: string | null;
  history: Array<{
    docID?: string;
    periodEnd?: string;
    fiscalYear?: number | string;
    year?: number | string;
  }> | null;
  financials: StoredFinancials | null;
};

type Target = {
  ticker: string;
  companyName: string;
  docID: string;
  historyDocIDs: string[];
};

function parsePositiveInteger(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function latestHistoryDocument(history: AnalysisRow["history"]) {
  if (!Array.isArray(history)) return null;
  return [...history]
    .filter((row) => typeof row.docID === "string" && /^S100[A-Z0-9]+$/.test(row.docID))
    .sort((left, right) => {
      const leftKey = left.periodEnd ?? String(left.fiscalYear ?? left.year ?? "");
      const rightKey = right.periodEnd ?? String(right.fiscalYear ?? right.year ?? "");
      return leftKey.localeCompare(rightKey);
    })
    .at(-1)?.docID ?? null;
}

function alreadyUsesFinancialMetadata(financials: StoredFinancials | null) {
  return Boolean(
    financials &&
      typeof financials.financialProfile === "string" &&
      typeof financials.revenueLabel === "string" &&
      typeof financials.operatingIncomeLabel === "string" &&
      typeof financials.currentRatioApplicable === "boolean"
  );
}

function runAnalysis(target: Target): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(command, ["tsx", "scripts/analyze-company.ts"], {
      stdio: "inherit",
      env: {
        ...process.env,
        TICKER: target.ticker,
        COMPANY_NAME: target.companyName,
        DOC_ID: target.docID,
        HISTORY_DOC_IDS: target.historyDocIDs.join(","),
      },
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}

async function main() {
  const concurrency = Math.min(3, parsePositiveInteger("concurrency", 3));
  const maxCompanies = parsePositiveInteger("max-companies", Number.MAX_SAFE_INTEGER);
  const force = process.argv.includes("--force");

  const [companies, analyses] = await Promise.all([
    loadAllSupabaseRows<FinancialCompany>(
      "金融業会社一覧の取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("all_market_companies")
          .select("ticker, company_name")
          .eq("listing_status", "listed")
          .eq("is_financial", true)
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
    loadAllSupabaseRows<AnalysisRow>(
      "金融業分析一覧の取得失敗",
      (from, to) =>
        supabaseAdmin
          .from("company_analyses")
          .select("ticker, doc_id, history, financials")
          .order("ticker", { ascending: true })
          .range(from, to)
    ),
  ]);

  const analysisByTicker = new Map(analyses.map((row) => [row.ticker, row]));
  let alreadyUpdated = 0;
  let missingDocument = 0;

  const targets = companies
    .map((company): Target | null => {
      const analysis = analysisByTicker.get(company.ticker);
      if (!analysis?.doc_id) {
        missingDocument += 1;
        return null;
      }

      const latestDocID = latestHistoryDocument(analysis.history) ?? analysis.doc_id;
      const revenue = analysis.financials?.revenue;
      const revenueIsValid =
        typeof revenue === "number" && Number.isFinite(revenue) && revenue > 0;
      const isCurrentDocument = latestDocID === analysis.doc_id;

      if (
        !force &&
        alreadyUsesFinancialMetadata(analysis.financials) &&
        revenueIsValid &&
        isCurrentDocument
      ) {
        alreadyUpdated += 1;
        return null;
      }

      const historyDocIDs = Array.from(
        new Set([
          latestDocID,
          analysis.doc_id,
          ...(Array.isArray(analysis.history)
            ? analysis.history
                .map((row) => row?.docID)
                .filter(
                  (docID): docID is string =>
                    typeof docID === "string" && /^S100[A-Z0-9]+$/.test(docID)
                )
            : []),
        ])
      ).slice(0, 6);

      return {
        ticker: company.ticker,
        companyName: company.company_name,
        docID: latestDocID,
        historyDocIDs,
      };
    })
    .filter((target): target is Target => Boolean(target))
    .slice(0, maxCompanies);

  console.log("===== 金融業財務データ再解析 =====");
  console.log("金融業上場会社:", companies.length);
  console.log("更新済みスキップ:", alreadyUpdated);
  console.log("書類なしスキップ:", missingDocument);
  console.log("再解析対象:", targets.length);
  console.log("強制再解析:", force);
  console.log("同時実行数:", concurrency);

  let nextIndex = 0;
  let succeeded = 0;
  const failures: Array<{ ticker: string; exitCode: number | null }> = [];

  const worker = async (workerNumber: number) => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= targets.length) return;

      const target = targets[index];
      console.log(
        `\n[${index + 1}/${targets.length} worker ${workerNumber}] ` +
          `${target.ticker} ${target.companyName} 履歴${target.historyDocIDs.length}件`
      );

      let exitCode: number | null = null;
      try {
        exitCode = await runAnalysis(target);
      } catch (error) {
        console.error(`${target.ticker}: 分析プロセス起動失敗`, error);
      }

      if (exitCode === 0) succeeded += 1;
      else failures.push({ ticker: target.ticker, exitCode });
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, targets.length)) },
      (_, index) => worker(index + 1)
    )
  );

  console.log("\n===== 金融業財務データ再解析結果 =====");
  console.log("更新済みスキップ:", alreadyUpdated);
  console.log("成功:", succeeded);
  console.log("失敗:", failures.length);
  for (const failure of failures) {
    console.log(`- ${failure.ticker}: exit ${failure.exitCode ?? "unknown"}`);
  }

  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("金融業財務データ再解析に失敗しました。", error);
  process.exit(1);
});
