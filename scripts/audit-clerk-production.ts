import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://kessan-tantei.jp").replace(/\/$/, "");
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const REQUIRE_CLERK_KEYS = process.env.REQUIRE_CLERK_KEYS === "1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function verifyClerkKey(
  name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" | "CLERK_SECRET_KEY",
  livePrefix: string,
  testPrefix: string
) {
  const value = process.env[name];

  if (!value) {
    if (REQUIRE_CLERK_KEYS) {
      throw new Error(`${name} がありません。本番監査ではClerk Productionキーが必須です`);
    }
    console.log(`${name}: runtime HTTP audit only (key not provided to this workflow)`);
    return;
  }

  assert(
    !value.startsWith(testPrefix),
    `${name} がClerk Developmentキー (${testPrefix}...) です。本番では ${livePrefix}... が必須です`
  );
  assert(
    value.startsWith(livePrefix),
    `${name} の形式が本番用ではありません。本番では ${livePrefix}... が必須です`
  );

  console.log(`${name}: production key detected`);
}

function isClerkDevelopmentLocation(location: string | null) {
  if (!location) return false;

  try {
    const host = new URL(location, SITE_URL).hostname.toLowerCase();
    return host === "clerk.accounts.dev" || host.endsWith(".clerk.accounts.dev") || host.endsWith(".accounts.dev");
  } catch {
    return /accounts\.dev/i.test(location);
  }
}

async function verifyPublicUrl(pathname: string) {
  const expectedUrl = `${SITE_URL}${pathname}`;
  const response = await fetch(expectedUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "user-agent": GOOGLEBOT_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ja,en-US;q=0.8,en;q=0.6",
    },
  });

  const location = response.headers.get("location");
  const xRobotsTag = response.headers.get("x-robots-tag");

  assert(
    !isClerkDevelopmentLocation(location),
    `${pathname} がClerk Development instance (${location}) へ転送されています。` +
      " Development instanceでは検索エンジンがクロール・インデックスできません"
  );
  assert(
    !xRobotsTag?.toLowerCase().includes("noindex"),
    `${pathname} の X-Robots-Tag に noindex があります: ${xRobotsTag}`
  );
  assert(
    response.status === 200,
    `${pathname} がGooglebot相当リクエストへ ${response.status} を返しました` +
      (location ? ` (Location: ${location})` : "")
  );

  console.log(`${pathname}: 200 / no Clerk development handshake / no X-Robots-Tag noindex`);
}

async function main() {
  console.log("===== Clerk production audit =====");
  console.log(`site: ${SITE_URL}`);

  verifyClerkKey("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_", "pk_test_");
  verifyClerkKey("CLERK_SECRET_KEY", "sk_live_", "sk_test_");

  assert(
    SITE_URL === "https://kessan-tantei.jp",
    `NEXT_PUBLIC_APP_URL が正規本番URLではありません: ${SITE_URL}`
  );

  await verifyPublicUrl("/");
  await verifyPublicUrl("/robots.txt");

  console.log("Clerk production audit: PASS");
}

main().catch((error) => {
  console.error("Clerk production audit: FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
