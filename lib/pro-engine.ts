import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

export const FREE_VISIBLE_S_RANK_LIMIT = 3;

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

export async function isAdminPreviewUser() {
  const allowedEmails = adminEmails();
  if (allowedEmails.size === 0) return false;

  const user = await currentUser();
  if (!user) return false;

  const emails = user.emailAddresses
    .map((email) => normalizeEmail(email.emailAddress))
    .filter(Boolean);

  return emails.some((email) => allowedEmails.has(email));
}

export function isSRankCompany(company: {
  score?: number | null;
  danger_score?: number | null;
  risk_level?: string | null;
}) {
  return Number(company.score ?? 0) >= 90 && company.risk_level !== "EXCLUDED";
}

export async function getCurrentProfile() {
  const { userId } = await auth();

  if (!userId) return null;

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  return data;
}

export function profileIsPro(profile: any) {
  if (!profile) return false;

  return (
    profile.plan === "pro" ||
    profile.subscription_status === "active" ||
    profile.subscription_status === "trialing"
  );
}

export async function isProUser() {
  const profile = await getCurrentProfile();
  if (profileIsPro(profile)) return true;

  return isAdminPreviewUser();
}

export async function canViewAiAnalysis() {
  const profile = await getCurrentProfile();
  const adminPreview = await isAdminPreviewUser();

  if (!profile) {
    return {
      allowed: adminPreview,
      isPro: adminPreview,
      remaining: 0,
      profile: null,
      adminPreview,
    };
  }

  const isPro = profileIsPro(profile) || adminPreview;
  const freeUses = Number(profile.free_ai_uses ?? 0);
  const remaining = Math.max(0, 3 - freeUses);

  return {
    allowed: isPro || freeUses < 3,
    isPro,
    remaining,
    profile,
    adminPreview,
  };
}

export async function consumeFreeAiUseIfNeeded() {
  const profile = await getCurrentProfile();

  if (!profile) return;
  if (profileIsPro(profile)) return;
  if (await isAdminPreviewUser()) return;

  const freeUses = Number(profile.free_ai_uses ?? 0);

  if (freeUses >= 3) return;

  await supabaseAdmin
    .from("profiles")
    .update({
      free_ai_uses: freeUses + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("clerk_user_id", profile.clerk_user_id);
}
