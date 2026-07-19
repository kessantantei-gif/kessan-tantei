import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const VERCEL_PRODUCTION_HOST = "kessan-tantei.vercel.app";
const CANONICAL_HOST = "kessan-tantei.jp";

export default clerkMiddleware((_auth, request) => {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const requestHost = (forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host)
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");

  if (requestHost !== VERCEL_PRODUCTION_HOST) return;

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
