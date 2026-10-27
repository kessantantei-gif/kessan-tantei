const JPX_LIST_PAGE_URL =
  "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html";

const JPX_LIST_FALLBACK_URL =
  "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xlsx";

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#38;", "&")
    .replaceAll("&quot;", '"');
}

function workbookCandidates(html: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => decodeHtmlAttribute(match[1] ?? ""))
    .filter(Boolean)
    .map((href) => new URL(href, JPX_LIST_PAGE_URL).toString())
    .filter((url) => /\.xlsx?(?:$|[?#])/i.test(url));

  return [...new Set(hrefs)].sort((a, b) => {
    const score = (url: string) =>
      (url.includes("data_j.") ? 100 : 0)
      + (url.includes("tvdivq0000001vg2-att") ? 20 : 0)
      + (url.endsWith(".xlsx") ? 5 : 0);
    return score(b) - score(a);
  });
}

export async function resolveJpxListWorkbookUrl(): Promise<string> {
  const override = process.env.JPX_LIST_URL?.trim();
  if (override) return override;

  try {
    const response = await fetch(JPX_LIST_PAGE_URL, {
      headers: { "user-agent": "kessan-tantei-market-master/1.1" },
    });
    if (!response.ok) {
      throw new Error(`JPX listing page returned ${response.status}`);
    }

    const html = await response.text();
    const [current] = workbookCandidates(html);
    if (current) return current;
    throw new Error("JPX listing workbook link was not found on the official page");
  } catch (error) {
    console.warn(
      "JPX listing URL discovery failed; using the current official fallback URL:",
      error instanceof Error ? error.message : String(error)
    );
    return JPX_LIST_FALLBACK_URL;
  }
}

export const JPX_LISTING_PAGE_URL = JPX_LIST_PAGE_URL;
export const JPX_LISTING_FALLBACK_URL = JPX_LIST_FALLBACK_URL;
