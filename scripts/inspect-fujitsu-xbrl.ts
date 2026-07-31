import AdmZip from "adm-zip";

const url = "https://www.release.tdnet.info/inbs/081220260730502924.zip";

function attr(attributes: string, name: string) {
  return attributes.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? null;
}

function cleanText(value: string) {
  return value
    .replace(/<ix:exclude\b[^>]*>[\s\S]*?<\/ix:exclude>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const response = await fetch(url, {
    headers: { "user-agent": "kessan-tantei-xbrl-inspector/1.0" },
  });
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const zip = new AdmZip(buffer);
  console.log("===== FUJITSU XBRL RELEVANT FACTS =====");

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !/-ixbrl\.html?$/i.test(entry.entryName)) continue;

    const text = entry.getData().toString("utf8");
    const facts: Array<Record<string, string | null>> = [];
    const factPattern = /<ix:(nonFraction|nonNumeric)\b([^>]*)>([\s\S]*?)<\/ix:\1>/gi;

    for (const match of text.matchAll(factPattern)) {
      const attributes = match[2];
      const name = attr(attributes, "name");
      if (!name || !/(revenue|sales|turnover|operating|profit|income|cashflow)/i.test(name)) {
        continue;
      }

      facts.push({
        name,
        contextRef: attr(attributes, "contextRef"),
        unitRef: attr(attributes, "unitRef"),
        scale: attr(attributes, "scale"),
        sign: attr(attributes, "sign"),
        format: attr(attributes, "format"),
        value: cleanText(match[3]),
      });
    }

    if (facts.length > 0) {
      console.log(`--- ${entry.entryName} ---`);
      console.log(JSON.stringify(facts, null, 2));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
