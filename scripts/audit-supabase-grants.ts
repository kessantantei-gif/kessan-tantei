import fs from "node:fs";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const catchupName = "20261021_001_explicit_data_api_grants.sql";
const cutoff = "20261030";

function fail(message: string): never {
  throw new Error(`Supabase grant audit failed: ${message}`);
}

if (!fs.existsSync(migrationsDir)) fail("supabase/migrations is missing");

const catchupPath = path.join(migrationsDir, catchupName);
if (!fs.existsSync(catchupPath)) fail(`${catchupName} is missing`);

const catchup = fs.readFileSync(catchupPath, "utf8");
const normalizedCatchup = catchup.toLowerCase().replace(/\s+/g, " ");

for (const marker of [
  "grant usage on schema public to service_role",
  "grant all privileges on all tables in schema public to service_role",
  "grant all privileges on all sequences in schema public to service_role",
  "alter default privileges for role postgres in schema public",
  "grant all privileges on tables to service_role",
  "grant all privileges on sequences to service_role",
  "public.company_master",
  "public.company_disclosures",
  "public.company_quarterly_financials",
  "to anon, authenticated",
]) {
  if (!normalizedCatchup.includes(marker)) {
    fail(`catch-up migration is missing required marker: ${marker}`);
  }
}

if (/grant\s+(?:all|insert|update|delete|truncate)[^;]*?\bto\s+anon\b/i.test(catchup)) {
  fail("catch-up migration must not grant anon write/all privileges");
}
if (/grant\s+(?:all|insert|update|delete|truncate)[^;]*?\bto\s+authenticated\b/i.test(catchup)) {
  fail("catch-up migration must not grant authenticated write/all privileges");
}

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const createTableRegex =
  /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi;

const violations: string[] = [];

for (const name of migrationFiles) {
  const prefix = name.slice(0, 8);
  if (!/^\d{8}$/.test(prefix) || prefix < cutoff) continue;

  const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
  const tables = [...sql.matchAll(createTableRegex)].map((match) => match[1]);

  for (const table of tables) {
    const grantStatements = sql
      .split(";")
      .filter((statement) => /^\s*grant\b/i.test(statement))
      .filter((statement) => /\bservice_role\b/i.test(statement));

    const hasExplicitGrant = grantStatements.some((statement) =>
      new RegExp(`\\bpublic\\.${table}\\b`, "i").test(statement)
    );

    if (!hasExplicitGrant) {
      violations.push(
        `${name}: public.${table} is created without an explicit service_role GRANT in the same migration`
      );
    }
  }
}

if (violations.length) fail(violations.join("\n"));

console.log(
  `Supabase grant audit passed: catch-up grants are present and ${migrationFiles.filter((name) => name.slice(0, 8) >= cutoff).length} post-cutoff migration(s) satisfy explicit service_role grants.`
);
