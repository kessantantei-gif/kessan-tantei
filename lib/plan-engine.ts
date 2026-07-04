export type ProfilePlan = {
  plan?: string | null;
  subscription_status?: string | null;
};

export function isPro(profile?: ProfilePlan | null) {
  return (
    profile?.plan === "pro" ||
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing"
  );
}

export function getWatchLimit(profile?: ProfilePlan | null) {
  return isPro(profile) ? 9999 : 3;
}

export function planLabel(profile?: ProfilePlan | null) {
  return isPro(profile) ? "Pro" : "Free";
}