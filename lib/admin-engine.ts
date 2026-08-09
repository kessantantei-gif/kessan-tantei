import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeEmail(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function adminEmails() {
  return new Set(
    (process.env.KESSAN_TANTEI_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

async function isConfiguredAdminEmail() {
  const allowedEmails = adminEmails();
  if (allowedEmails.size === 0) return false;

  const user = await currentUser();
  if (!user) return false;

  return user.emailAddresses
    .map((email) => normalizeEmail(email.emailAddress))
    .some((email) => allowedEmails.has(email));
}

export async function isAdminUser() {
  // Admin routes are private application routes and must use Clerk directly.
  // They must never depend on the crawler-safe auth wrapper used by public SEO pages.
  const { userId } = await auth();
  if (!userId) return false;

  const [{ data, error }, configuredAdmin] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("clerk_user_id", userId)
      .maybeSingle(),
    isConfiguredAdminEmail(),
  ]);

  if (configuredAdmin) return true;
  if (error) {
    console.error("admin profile lookup failed", {
      userId,
      message: error.message,
    });
    return false;
  }

  return data?.role === "admin";
}
