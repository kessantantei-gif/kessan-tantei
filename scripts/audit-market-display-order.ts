import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components", "docs", "lib"];
const extensions = new Set([".ts", ".tsx", ".md", ".json"]);
const forbidden = [
  "グロース・スタンダード・プライム",
  "グロース、スタンダード、プライム",
  "グロース／スタンダード／プライム",
  "Growth・Standard・Prime",
  "Growth / Standard / Prime",
];

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? files(target) : extensions.has(path.extname(target)) ? [target] : [];
  });
}

const errors: string[] = [];
for (const file of roots.flatMap(files)) {
  const text = fs.readFileSync(file, "utf8");
  for (const phrase of forbidden) {
    if (text.includes(phrase)) errors.push(`${file}: ${phrase}`);
  }
}

const markets = fs.readFileSync("lib/markets.ts", "utf8");
const prime = markets.indexOf("  prime: {");
const standard = markets.indexOf("  standard: {");
const growth = markets.indexOf("  growth: {");
if (!(prime >= 0 && prime < standard && standard < growth)) {
  errors.push("lib/markets.ts: marketList order is not prime -> standard -> growth");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("market display order: prime -> standard -> growth");
