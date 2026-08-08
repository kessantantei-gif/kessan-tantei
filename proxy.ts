import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

const VERCEL_PRODUCTION_HOST = "kessan-tantei.vercel.app";
const WWW_HOST = "www.kessan-tantei.jp";
const CANONICAL_HOST = "kessan-tantei.jp";
const REDIRECT_HOSTS = new Set([VERCEL_PRODUCTION_HOST, WWW_HOST]);
const SEARCH_CRAWLER_HEADER = "x-kessan-search-crawler";
const SEARCH_CRAWLER_UA =
  /Googlebot|Google-InspectionTool|GoogleOther|AdsBot-Google|Storebot-Google/i;

const INDEXABLE_PATH_PATTERNS = [
  /^\/$/,
  /^\/robots\.txt$/,
  /^\/sitemap\.xml$/,
  /^\/markets$/,
  /^\/latest-earnings$/,
  /^\/standard(?:\/ranking)?$/,
  /^\/prime(?:\/ranking)?$/,
  /^\/updates$/,
  /^\/news$/,
  /^\/ranking(?:\/[^/]+)?$/,
  /^\/themes(?:\/[^/]+)?$/,
  /^\/features$/,
  /^\/data-quality$/,
  /^\/about-growth$/,
  /^\/pricing$/,
  /^\/legal$/,
  /^\/privacy$/,
  /^\/terms$/,
  /^\/disclaimer$/,
  /^\/companies\/(growth|prime|standard)(?:\/\d+)?$/,
  /^\/company\/[^/]+$/,
];

function normalizeHost(value: string | null | undefined) {
  if (!value) return "";
  return value
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function canonicalRedirect(request: NextRequest) {
  const hostHeader = normalizeHost(request.headers.get("host"));
  const nextUrlHost = normalizeHost(request.nextUrl.hostname);
  const forwardedHost = normalizeHost(request.headers.get("x-forwarded-host"));
  const requestHost = hostHeader || nextUrlHost || forwardedHost;

  if (requestHost === CANONICAL_HOST) return null;
  if (!REDIRECT_HOSTS.has(requestHost)) return null;

  const canonicalUrl = request.nextUrl.clone();
  canonicalUrl.protocol = "https:";
  canonicalUrl.hostname = CANONICAL_HOST;
  canonicalUrl.port = "";

  return NextResponse.redirect(canonicalUrl, 308);
}

function isIndexableSearchCrawlerRequest(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!SEARCH_CRAWLER_UA.test(userAgent)) return false;

  return INDEXABLE_PATH_PATTERNS.some((pattern) =>
    pattern.test(request.nextUrl.pathname)
  );
}

const clerk = clerkMiddleware();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const redirect = canonicalRedirect(request);
  if (redirect) return redirect;

  // Public URLs listed in the sitemap must never enter Clerk's development
  // handshake. Development instances redirect browser-like crawler requests to
  // *.accounts.dev, whose response carries X-Robots-Tag: noindex, nofollow.
  // Search crawlers get a normal signed-out public render instead.
  if (isIndexableSearchCrawlerRequest(request)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(SEARCH_CRAWLER_HEADER, "1");

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return clerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
