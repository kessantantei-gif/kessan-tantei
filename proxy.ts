import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const VERCEL_PRODUCTION_HOST = "kessan-tantei.vercel.app";
const WWW_HOST = "www.kessan-tantei.jp";
const CANONICAL_HOST = "kessan-tantei.jp";
const REDIRECT_HOSTS = new Set([VERCEL_PRODUCTION_HOST, WWW_HOST]);

function normalizeHost(value: string | null | undefined) {
  if (!value) return "";
  return value
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export default clerkMiddleware((_auth, request) => {
  // The actual Host header represents the URL requested by the client.
  // Do not prefer x-forwarded-host here: an upstream proxy can set it to a
  // Vercel/internal alias even when the browser/Googlebot requested the
  // canonical domain, which would create a canonical -> canonical 308 loop.
  const hostHeader = normalizeHost(request.headers.get("host"));
  const nextUrlHost = normalizeHost(request.nextUrl.hostname);
  const forwardedHost = normalizeHost(request.headers.get("x-forwarded-host"));
  const requestHost = hostHeader || nextUrlHost || forwardedHost;

  // Never redirect an already canonical request, regardless of forwarded
  // proxy headers.
  if (requestHost === CANONICAL_HOST) return;
  if (!REDIRECT_HOSTS.has(requestHost)) return;

  const canonicalUrl = request.nextUrl.clone();
  canonicalUrl.protocol = "https:";
  canonicalUrl.hostname = CANONICAL_HOST;
  canonicalUrl.port = "";

  return NextResponse.redirect(canonicalUrl, 308);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
