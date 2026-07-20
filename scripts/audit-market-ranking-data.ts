import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadRankingCompanies } from "../lib/load-ranking-companies";
import { getRankingDefinition } from "../lib/rankings/definitions";
import { rankCompanies } from "../lib/rankings/engine";

type MarketSegment = "prime" | "standard";

const MARKETS: MarketSegment[] = ["prime", "standard"];
const REQUIRED_RANKINGS = [
  "gross-margin",
  "gross-profit-growth",
  "net-margin",
  "net-income-growth",
] as const;

async function main() {
  const results = [];
  const failures: string[] = [];

  for (const market of MARKETS) {
    const companies = await loadRankingCompanies(market);
    const rankings = REQUIRED_RANKINGS.map((slug) => {
      const definition = getRankingDefinition(slug);
      if (!definition) throw new Error(`Ranking definition not found: ${slug}`);

      const ranked = rankCompanies(companies, definition);
      const entry = {
        market,
        slug,
        title: definition.title,
        companies: ranked.length,
        top: ranked.slice(0, 5).map((item, index) => ({
          rank: index + 1,
          ticker: item.company.ticker,
          companyName: item.company.company_name,
          value: item.value,
        })),
      };

      if (ranked.length === 0) {
        failures.push(`${market}/${slug} has no ranking entries`);
      }

      return entry;
    });

    results.push({
      market,
      analyzedCompanies: companies.length,
      rankings,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    failures,
    results,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/market-ranking-data-audit.json",
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("===== Prime / Standard ranking audit =====");
  for (const market of results) {
    console.log(`${market.market}: analyzed=${market.analyzedCompanies}`);
    for (const ranking of market.rankings) {
      console.log(`- ${ranking.slug}: ${ranking.companies} companies`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`[ERROR] ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Prime / Standard ranking audit failed", error);
  process.exit(1);
});
