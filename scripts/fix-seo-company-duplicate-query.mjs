import fs from "node:fs";

const path = "app/company/[ticker]/page.tsx";
let source = fs.readFileSync(path, "utf8");
const duplicate = `  const { data, error } = await supabaseAdmin
    .from("company_analyses")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

`;
const first = source.indexOf(duplicate);
const second = source.indexOf(duplicate, first + duplicate.length);
if (second < 0) throw new Error("削除対象の重複クエリが見つかりません");
source = source.slice(0, second) + source.slice(second + duplicate.length);
fs.writeFileSync(path, source);
console.log("重複クエリを削除しました");
