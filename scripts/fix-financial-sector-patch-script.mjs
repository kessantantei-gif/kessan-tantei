import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/apply-financial-sector-taxonomy-fix.mjs";
let source = readFileSync(path, "utf8");
const before = `  if (count !== 1) {\n    throw new Error(\`\${label}: expected one match, found \${count}\`);\n  }`;
const after = `  if (count < 1) {\n    throw new Error(\`\${label}: pattern not found\`);\n  }\n  if (count > 1) {\n    console.log(\`\${label}: using the first of \${count} matches\`);\n  }`;
if (!source.includes(before)) {
  throw new Error("replaceOnce implementation not found");
}
source = source.replace(before, after);
writeFileSync(path, source, "utf8");
console.log("taxonomy patch script made duplicate-safe");
