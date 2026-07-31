import fs from "node:fs";

const path = "scripts/sync-tdnet-quarterly.ts";
let source = fs.readFileSync(path, "utf8");

if (!source.includes("function tdnetListUrl")) {
  const target = `function targetDates() {`;
  if (!source.includes(target)) {
    throw new Error("targetDates関数が見つかりません");
  }

  source = source.replace(
    target,
    `function tdnetListUrl(date: string, page: number) {
  const yyyymmdd = date.replace(/-/g, "");
  const pageText = String(page).padStart(3, "0");
  return listTemplate
    .replace("{date}", date)
    .replace("{yyyymmdd}", yyyymmdd)
    .replace("{page}", pageText)
    .replace(/I_list_\\d{3}_/, \`I_list_\${pageText}_\`);
}

function targetDates() {`
  );

  const oldLoop = `    for (const date of dates) {
      const yyyymmdd = date.replace(/-/g, "");
      const url = listTemplate.replace("{date}", date).replace("{yyyymmdd}", yyyymmdd);
      try {
        candidates.push(...parseCandidates(await fetchText(url), url, date));
      } catch (error) {
        listFailures.push(\`\${date}: \${error instanceof Error ? error.message : String(error)}\`);
      }
    }`;

  const newLoop = `    for (const date of dates) {
      for (let page = 1; page <= 50; page += 1) {
        const url = tdnetListUrl(date, page);
        try {
          candidates.push(...parseCandidates(await fetchText(url), url, date));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (page === 1 || !message.includes(": 404")) {
            listFailures.push(\`\${date} page \${page}: \${message}\`);
          }
          break;
        }
      }
    }`;

  if (!source.includes(oldLoop)) {
    throw new Error("TDnet単一ページ取得ループが見つかりません");
  }
  source = source.replace(oldLoop, newLoop);
}

fs.writeFileSync(path, source);
console.log("TDnet日次一覧を全ページ取得する修正を適用しました");
