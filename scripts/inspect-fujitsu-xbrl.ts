import AdmZip from "adm-zip";

const url = "https://www.release.tdnet.info/inbs/081220260730502924.zip";

async function main() {
  const response = await fetch(url, {
    headers: { "user-agent": "kessan-tantei-xbrl-inspector/1.0" },
  });
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const zip = new AdmZip(buffer);
  console.log("===== FUJITSU XBRL ZIP ENTRIES =====");

  for (const entry of zip.getEntries()) {
    console.log(`${entry.entryName} (${entry.header.size} bytes)`);
    if (!/\.(xbrl|xml|html?|htm)$/i.test(entry.entryName)) continue;

    const text = entry.getData().toString("utf8");
    const dates = [...text.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map((match) => match[0]);
    const uniqueDates = [...new Set(dates)].slice(0, 30);
    const signals = [
      "<xbrli:context",
      "<context",
      "<xbrli:endDate",
      "<endDate",
      "<xbrli:instant",
      "<instant",
      "CurrentPeriodEndDate",
      "CurrentFiscalYearEndDate",
      "CurrentQuarterEndDate",
      "ix:nonNumeric",
      "ix:nonFraction",
    ].filter((signal) => text.includes(signal));

    console.log(
      JSON.stringify(
        {
          entry: entry.entryName,
          length: text.length,
          signals,
          uniqueDates,
          head: text.slice(0, 1000),
        },
        null,
        2
      )
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
