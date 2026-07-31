import fs from "node:fs";

const path = "scripts/sync-tdnet-quarterly.ts";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) {
      console.log(`${label}: already applied`);
      return;
    }
    throw new Error(`${label} の置換対象が見つかりません`);
  }
  source = source.replace(before, after);
}

replaceOnce(
`type Fact = {
  name: string;
  value: string;
  contextRef: string | null;
};`,
`type Fact = {
  name: string;
  value: string;
  contextRef: string | null;
};`,
"Fact型"
);

const oldCollector = `function collectFacts(node: unknown, facts: Fact[], inheritedName = "") {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") {
    if (inheritedName && String(node).trim()) {
      facts.push({ name: localName(inheritedName), value: String(node).trim(), contextRef: null });
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectFacts(item, facts, inheritedName);
    return;
  }

  const record = node as Record<string, unknown>;
  if ("#text" in record && inheritedName) {
    facts.push({
      name: localName(inheritedName),
      value: String(record["#text"] ?? "").trim(),
      contextRef: typeof record["@_contextRef"] === "string" ? record["@_contextRef"] : null,
    });
  }

  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@_") || key === "#text") continue;
    collectFacts(value, facts, key);
  }
}

function parseNumeric(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-" || normalized === "—") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}`;

const newCollector = `function nodeText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");

  const record = node as Record<string, unknown>;
  return Object.entries(record)
    .filter(([key]) => !key.startsWith("@_") && !/^(?:ix:)?exclude$/i.test(key))
    .map(([, value]) => nodeText(value))
    .join("");
}

function parseNumeric(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[，,\\s]/g, "")
    .replace(/^\\((.*)\\)$/, "-$1")
    .trim();
  if (!normalized || normalized === "-" || normalized === "—") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizedFactValue(record: Record<string, unknown>, rawValue: string) {
  const numeric = parseNumeric(rawValue);
  if (numeric === null) return rawValue.trim();

  const scaleValue = Number(record["@_scale"] ?? 0);
  const scale = Number.isFinite(scaleValue) ? scaleValue : 0;
  const signed = record["@_sign"] === "-" ? -Math.abs(numeric) : numeric;
  return String(signed * 10 ** scale);
}

function collectFacts(node: unknown, facts: Fact[], inheritedName = "") {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") {
    if (inheritedName && String(node).trim()) {
      facts.push({ name: localName(inheritedName), value: String(node).trim(), contextRef: null });
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectFacts(item, facts, inheritedName);
    return;
  }

  const record = node as Record<string, unknown>;
  const inlineConcept = typeof record["@_name"] === "string" ? record["@_name"] : null;
  const factName = inlineConcept ?? inheritedName;
  const hasFactValue = inlineConcept !== null || "#text" in record;

  if (factName && hasFactValue) {
    const rawValue = nodeText(record).trim();
    if (rawValue) {
      facts.push({
        name: localName(factName),
        value: normalizedFactValue(record, rawValue),
        contextRef: typeof record["@_contextRef"] === "string" ? record["@_contextRef"] : null,
      });
    }
  }

  if (inlineConcept) return;

  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@_") || key === "#text") continue;
    collectFacts(value, facts, key);
  }
}`;

replaceOnce(oldCollector, newCollector, "Inline XBRL fact collector");

const oldInstance = `  const zip = new AdmZip(buffer);
  const instance = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .find((entry) => /(?:\\.xbrl|\\.xml)$/i.test(entry.entryName) && !/taxonomy|label|presentation|definition|calculation/i.test(entry.entryName));
  if (!instance) throw new Error("XBRLインスタンスがZIP内にありません");

  const xml = instance.getData().toString("utf8");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
  const parsed = parser.parse(xml);
  const facts: Fact[] = [];
  collectFacts(parsed, facts);`;

const newInstance = `  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const inlineEntries = entries
    .filter((entry) => /-ixbrl\\.html?$/i.test(entry.entryName))
    .sort((a, b) => {
      const priority = (name: string) => {
        if (/\\/Summary\\//i.test(name)) return 0;
        if (/0101010-qcfs/i.test(name)) return 1;
        if (/0102010-qcpl/i.test(name)) return 2;
        if (/0104010-qccf/i.test(name)) return 3;
        return 10;
      };
      return priority(a.entryName) - priority(b.entryName);
    });
  const fallbackInstance = entries.find(
    (entry) =>
      /\\.xbrl$/i.test(entry.entryName) ||
      (/\\.xml$/i.test(entry.entryName) &&
        !/(?:-def|-cal|-pre|-lab|manifest|catalog|taxonomy|label|presentation|definition|calculation)\\.xml$/i.test(
          entry.entryName
        ))
  );
  const instanceEntries = inlineEntries.length > 0 ? inlineEntries : fallbackInstance ? [fallbackInstance] : [];
  if (instanceEntries.length === 0) throw new Error("XBRLインスタンスがZIP内にありません");

  const documents = instanceEntries.map((entry) => entry.getData().toString("utf8"));
  const xml = documents.join("\\n");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseTagValue: false,
    trimValues: true,
  });
  const facts: Fact[] = [];
  for (const document of documents) {
    collectFacts(parser.parse(document), facts);
  }`;

replaceOnce(oldInstance, newInstance, "Inline XBRL ZIP selection");

source = source.replaceAll('"tdnet-quarterly-v2"', '"tdnet-quarterly-v3"');
fs.writeFileSync(path, source);
console.log("Inline XBRLの複数HTML抽出・概念名・scale対応を適用しました");
