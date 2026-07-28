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
if (!source.includes(duplicate)) throw new Error("削除対象の重複クエリが見つかりません");
source = source.replace(duplicate, "");
fs.writeFileSync(path, source);
console.log("重複クエリを削除しました");
