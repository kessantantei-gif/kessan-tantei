"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";

export async function updateProfile(formData: FormData) {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId) redirect("/");

  const displayName = String(formData.get("display_name") || "").trim();

  if (!displayName || displayName.length > 30) {
    redirect("/profile?error=1");
  }

  const fallbackName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "ログインユーザー";

  const { error } = await supabaseAdmin.from("profiles").upsert({
    clerk_user_id: userId,
    display_name: displayName || fallbackName,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error(error);
    redirect("/profile?error=1");
  }

  redirect("/profile?saved=1");
}