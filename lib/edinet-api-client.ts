export const EDINET_API_BASE = "https://api.edinet-fsa.go.jp/api/v2";

export function buildEdinetApiUrl(
  pathname: string,
  params: Record<string, string>
) {
  const url = new URL(`${EDINET_API_BASE}/${pathname.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchEdinetJson<T>(
  url: URL | string,
  attempts = 4
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "kessan-tantei-edinet/1.1",
        },
      });
      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        throw new Error(
          `EDINET HTTP ${response.status} ${response.statusText}: ${text.slice(0, 160)}`
        );
      }

      if (
        !contentType.toLowerCase().includes("json") ||
        /^\s*</.test(text)
      ) {
        throw new Error(
          `EDINET returned non-JSON response (${contentType || "unknown content-type"}): ${text
            .slice(0, 160)
            .replace(/\s+/g, " ")}`
        );
      }

      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      const waitMs = 1500 * attempt;
      console.warn(
        `EDINET request attempt ${attempt}/${attempts} failed; retrying in ${waitMs}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      await delay(waitMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`EDINET request failed: ${String(lastError)}`);
}
