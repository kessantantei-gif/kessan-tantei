import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const DELETE_IDS = [
  "ee04dd07-b0af-41d5-8d65-6456503c168b",
  "3c5e1389-79d0-4c36-85df-c6f3f81ea746",
];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase
    .from("company_analyses")
    .select("id, ticker, company_name, score, danger_score, doc_id, created_at, updated_at")
    .in("id", DELETE_IDS);

  if (error) throw error;

  console.log("=== duplicate ticker cleanup ===");
  console.log({ apply, targetCount: DELETE_IDS.length, foundCount: data?.length ?? 0 });
  console.log("delete targets", data ?? []);

  if (!apply) {
    console.log("DRY RUN only. Add --apply to delete these duplicate rows.");
    return;
  }

  const { error: deleteError } = await supabase
    .from("company_analyses")
    .delete()
    .in("id", DELETE_IDS);

  if (deleteError) throw deleteError;

  console.log("Deleted duplicate rows.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
