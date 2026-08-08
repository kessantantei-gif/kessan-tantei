const isVercelProduction = process.env.VERCEL_ENV === "production";

if (!isVercelProduction) {
  console.log("Clerk production-key gate skipped outside Vercel Production.");
  process.exit(0);
}

const publishableKey = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim();
const secretKey = (process.env.CLERK_SECRET_KEY ?? "").trim();

const errors: string[] = [];

if (!publishableKey) {
  errors.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing in Vercel Production.");
} else if (!publishableKey.startsWith("pk_live_")) {
  errors.push("Vercel Production must use a Clerk Production publishable key (pk_live_), not a Development key.");
}

if (!secretKey) {
  errors.push("CLERK_SECRET_KEY is missing in Vercel Production.");
} else if (!secretKey.startsWith("sk_live_")) {
  errors.push("Vercel Production must use a Clerk Production secret key (sk_live_), not a Development key.");
}

if (errors.length > 0) {
  console.error("Clerk production environment verification FAILED");
  for (const error of errors) console.error(`- ${error}`);
  console.error("Production deployment is intentionally blocked because Clerk Development instances prevent search-engine indexing.");
  process.exit(1);
}

console.log("Clerk production environment verification passed: production key prefixes are active.");
