import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

export const FREE_VISIBLE_S_RANK_LIMIT = 3;

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
  return profileIsPro(profile);
}

export async function canViewAiAnalysis() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      allowed: false,
      isPro: false,
      remaining: 0,
      profile: null,
    };
  }

  const isPro = profileIsPro(profile);
  const freeUses = Number(profile.free_ai_uses ?? 0);
  const remaining = Math.max(0, 3 - freeUses);

  return {
    allowed: isPro || freeUses < 3,
    isPro,
    remaining,
    profile,
  };
}

export async function consumeFreeAiUseIfNeeded() {
  const profile = await getCurrentProfile();

  if (!profile) return;
  if (profileIsPro(profile)) return;

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