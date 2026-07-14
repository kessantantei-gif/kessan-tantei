import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminPreviewUser } from "@/lib/pro-engine";

export async function isAdminUser() {
  const { userId } = await auth();

  if (!userId) return false;

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (data?.role === "admin") return true;

  return isAdminPreviewUser();
}
