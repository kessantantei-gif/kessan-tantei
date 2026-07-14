import "dotenv/config";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const JPX_LIST_URL =
  process.env.JPX_LIST_URL ||
  "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls";
const EDINET_CODELIST_URL =
  process.env.EDINET_CODELIST_URL ||
  "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type MarketSegment = "growth" | "standard" | "prime";

type JpxCompany = {
  ticker: string;
  companyName: string;
  marketSegment: MarketSegment;
  marketRaw: string;
  industryCode: string | null;
  industryName: string | null;
  isForeign: boolean;
};

type EdinetCompany = {
  edinetCode: string;
  filerName: string;
  corporateNumber: string | null;
  securityCode: string;
};

type ExistingCompany = {
  id: string;
  ticker: string;
  market_segment: string;
  listing_status: string;
  edinet_code: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTicker(value: unknown) {
  const raw = clean(value).replace(/\.0$/, "");
  const direct = raw.match(/^([0-9A-Z]{4})$/i)?.[1];
  if (direct) return direct.toUpperCase();

  const edinetSecurityCode = raw.match(/^([0-9A-Z]{4})0$/i)?.[1];
  return edinetSecurityCode ? edinetSecurityCode.toUpperCase() : "";
}

function resolveMarket(raw: string): MarketSegment | null {
  if (raw.includes("プライム")) return "prime";
  if (raw.includes("スタンダード")) return "standard";
  if (raw.includes("グロース")) return "growth";
  return null;
}

function pick(row: Record<string, unknown>, candidates: string[]) {
  for (const key of candidates) {
    if (key in row && clean(row[key])) return row[key];
  }
  return "";
}

async function download(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "kessan-tantei-market-master/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${url} の取得に失敗しました: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function loadJpxCompanies(): Promise<JpxCompany[]> {
  const buffer = await download(JPX_LIST_URL);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("JPXファイルにシートがありません。");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: false,
  });

  const result = new Map<string, JpxCompany>();

  for (const row of rows) {
    const ticker = normalizeTicker(
      pick(row, ["コード", "証券コード", "銘柄コード", "Code"])
    );
    const companyName = clean(
      pick(row, ["銘柄名", "会社名", "銘柄名（日本語）", "Company Name"])
    );
    const marketRaw = clean(
      pick(row, ["市場・商品区分", "市場区分", "市場", "Market/Products"])
    );
    const marketSegment = resolveMarket(marketRaw);

    if (!ticker || !companyName || !marketSegment) continue;
    if (!marketRaw.includes("株式")) continue;
    if (marketRaw.includes("ETF") || marketRaw.includes("REIT") || marketRaw.includes("PRO")) {
      continue;
    }

    const industryCode = clean(
      pick(row, ["33業種コード", "業種コード", "33 Sector(code)"])
    );
    const industryName = clean(
      pick(row, ["33業種区分", "業種名", "33 Sector(name)"])
    );

    result.set(ticker, {
      ticker,
      companyName,
      marketSegment,
      marketRaw,
      industryCode: industryCode || null,
      industryName: industryName || null,
      isForeign: marketRaw.includes("外国"),
    });
  }

  if (result.size < 3000) {
    throw new Error(`JPX普通株が${result.size}件しか取得できませんでした。列構成変更の可能性があります。`);
  }

  return [...result.values()];
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[\s　]/g, "")
    .normalize("NFKC")
    .toUpperCase();
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return headers.findIndex((header) => {
    const normalized = normalizeHeader(header);
    return normalizedCandidates.some((candidate) => normalized.includes(candidate));
  });
}

function detectEdinetHeader(lines: string[]) {
  const maxScanRows = Math.min(lines.length, 30);

  for (let rowIndex = 0; rowIndex < maxScanRows; rowIndex += 1) {
    const headers = parseCsvLine(lines[rowIndex]);
    const edinetIndex = findHeaderIndex(headers, ["ＥＤＩＮＥＴコード", "EDINETコード"]);
    const filerIndex = findHeaderIndex(headers, ["提出者名"]);
    const corporateIndex = findHeaderIndex(headers, ["法人番号"]);
    const securityIndex = findHeaderIndex(headers, ["証券コード"]);

    if (edinetIndex >= 0 && filerIndex >= 0 && securityIndex >= 0) {
      return {
        rowIndex,
        headers,
        edinetIndex,
        filerIndex,
        corporateIndex,
        securityIndex,
      };
    }
  }

  const preview = lines
    .slice(0, Math.min(lines.length, 8))
    .map((line, index) => `${index + 1}: ${parseCsvLine(line).join(" / ")}`)
    .join(" | ");
  throw new Error(`EDINETコードリストのヘッダー行を検出できませんでした: ${preview}`);
}

async function loadEdinetCompanies(): Promise<Map<string, EdinetCompany>> {
  const buffer = await download(EDINET_CODELIST_URL);
  const zip = new AdmZip(buffer);
  const entry = zip
    .getEntries()
    .find((item) => item.entryName.toLowerCase().endsWith(".csv"));
  if (!entry) throw new Error("EDINETコードリストZIPにCSVがありません。");

  const text = new TextDecoder("shift_jis").decode(entry.getData());
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("EDINETコードリストが空です。");

  const {
    rowIndex: headerRowIndex,
    edinetIndex,
    filerIndex,
    corporateIndex,
    securityIndex,
  } = detectEdinetHeader(lines);

  const result = new Map<string, EdinetCompany>();
  for (const line of lines.slice(headerRowIndex + 1)) {
    const values = parseCsvLine(line);
    const ticker = normalizeTicker(values[securityIndex]);
    const edinetCode = clean(values[edinetIndex]);
    if (!ticker || !edinetCode) continue;

    result.set(ticker, {
      edinetCode,
      filerName: clean(values[filerIndex]),
      corporateNumber: corporateIndex >= 0 ? clean(values[corporateIndex]) || null : null,
      securityCode: ticker,
    });
  }

  if (result.size < 3000) {
    throw new Error(`EDINET証券コード紐付けが${result.size}件しかありません。列構成変更の可能性があります。`);
  }

  return result;
}

async function loadExistingCompanies() {
  const rows: ExistingCompany[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("all_market_companies")
      .select("id, ticker, market_segment, listing_status, edinet_code")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`既存会社取得失敗: ${error.message}`);
    rows.push(...((data ?? []) as ExistingCompany[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function upsertInChunks(rows: Record<string, unknown>[], size = 500) {
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    const { error } = await supabase
      .from("all_market_companies")
      .upsert(chunk, { onConflict: "ticker" });
    if (error) throw new Error(`会社マスタ更新失敗: ${error.message}`);
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from("data_import_runs")
    .insert({
      import_type: "jpx_market_master",
      status: "running",
      source: JPX_LIST_URL,
      started_at: startedAt,
      metadata: { edinetSource: EDINET_CODELIST_URL },
    })
    .select("id")
    .single();
  if (runError) throw new Error(`インポート履歴作成失敗: ${runError.message}`);

  try {
    const [jpxCompanies, edinetCompanies, existingCompanies] = await Promise.all([
      loadJpxCompanies(),
      loadEdinetCompanies(),
      loadExistingCompanies(),
    ]);

    const existingByTicker = new Map(existingCompanies.map((company) => [company.ticker, company]));
    const jpxTickers = new Set(jpxCompanies.map((company) => company.ticker));
    const now = new Date().toISOString();

    const rows = jpxCompanies.map((company) => {
      const edinet = edinetCompanies.get(company.ticker);
      return {
        ticker: company.ticker,
        company_name: company.companyName,
        edinet_code: edinet?.edinetCode ?? existingByTicker.get(company.ticker)?.edinet_code ?? null,
        corporate_number: edinet?.corporateNumber ?? null,
        market_segment: company.marketSegment,
        market_segment_updated_at: now,
        industry_code: company.industryCode,
        industry_name: company.industryName,
        security_type: "common_stock",
        listing_status: "listed",
        is_foreign: company.isForeign,
        scoring_model: `${company.marketSegment}_v1`,
        last_market_master_update: now,
        source_payload: {
          jpx: company,
          edinet: edinet ?? null,
          jpxSource: JPX_LIST_URL,
          edinetSource: EDINET_CODELIST_URL,
        },
        updated_at: now,
      };
    });

    await upsertInChunks(rows);

    const { data: refreshed, error: refreshedError } = await supabase
      .from("all_market_companies")
      .select("id, ticker, market_segment, listing_status")
      .limit(10000);
    if (refreshedError) throw new Error(`更新後会社取得失敗: ${refreshedError.message}`);

    let marketChanges = 0;
    let newListings = 0;
    for (const company of refreshed ?? []) {
      if (!jpxTickers.has(company.ticker)) continue;
      const before = existingByTicker.get(company.ticker);
      if (!before) newListings += 1;
      if (before && before.market_segment !== company.market_segment) marketChanges += 1;

      if (!before || before.market_segment !== company.market_segment) {
        if (before) {
          const { error } = await supabase
            .from("market_memberships")
            .update({ is_current: false, effective_to: new Date().toISOString().slice(0, 10) })
            .eq("company_id", company.id)
            .eq("is_current", true);
          if (error) throw new Error(`市場履歴終了失敗 ${company.ticker}: ${error.message}`);
        }

        const { error } = await supabase.from("market_memberships").insert({
          company_id: company.id,
          market_segment: company.market_segment,
          effective_from: new Date().toISOString().slice(0, 10),
          is_current: true,
          source: "jpx_market_master",
          source_reference: JPX_LIST_URL,
        });
        if (error) throw new Error(`市場履歴追加失敗 ${company.ticker}: ${error.message}`);
      }
    }

    const delistingCandidates = existingCompanies.filter(
      (company) => company.listing_status === "listed" && !jpxTickers.has(company.ticker)
    );

    for (const company of delistingCandidates) {
      const { error } = await supabase
        .from("all_market_companies")
        .update({ listing_status: "unknown", updated_at: now })
        .eq("id", company.id);
      if (error) throw new Error(`上場廃止候補更新失敗 ${company.ticker}: ${error.message}`);
    }

    const edinetMatched = rows.filter((row) => row.edinet_code).length;
    const { error: finishError } = await supabase
      .from("data_import_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        total_count: rows.length,
        success_count: rows.length,
        failure_count: 0,
        metadata: {
          jpxSource: JPX_LIST_URL,
          edinetSource: EDINET_CODELIST_URL,
          prime: rows.filter((row) => row.market_segment === "prime").length,
          standard: rows.filter((row) => row.market_segment === "standard").length,
          growth: rows.filter((row) => row.market_segment === "growth").length,
          edinetMatched,
          newListings,
          marketChanges,
          delistingCandidates: delistingCandidates.length,
        },
      })
      .eq("id", run.id);
    if (finishError) throw new Error(`インポート履歴完了更新失敗: ${finishError.message}`);

    console.log("=== JPX全市場マスタ同期完了 ===");
    console.log(`総数: ${rows.length}`);
    console.log(`Prime: ${rows.filter((row) => row.market_segment === "prime").length}`);
    console.log(`Standard: ${rows.filter((row) => row.market_segment === "standard").length}`);
    console.log(`Growth: ${rows.filter((row) => row.market_segment === "growth").length}`);
    console.log(`EDINET紐付け: ${edinetMatched}`);
    console.log(`新規上場: ${newListings}`);
    console.log(`市場変更: ${marketChanges}`);
    console.log(`上場廃止候補: ${delistingCandidates.length}`);
  } catch (error) {
    await supabase
      .from("data_import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        failure_count: 1,
        error_summary: error instanceof Error ? error.message : String(error),
      })
      .eq("id", run.id);
    throw error;
  }
}

main().catch((error) => {
  console.error("JPX全市場マスタ同期に失敗しました。");
  console.error(error);
  process.exit(1);
});