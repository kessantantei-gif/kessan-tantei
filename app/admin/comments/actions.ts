"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin-engine";
import { supabaseAdmin } from "@/lib/supabase";

export async function adminHideComment(formData: FormData) {
  if (!(await isAdminUser())) return;

  const { userId } = await auth();
  if (!userId) return;

  const commentId = String(formData.get("comment_id") || "").trim();
  if (!commentId) return;

  const { data: comment, error: loadError } = await supabaseAdmin
    .from("company_comments")
    .select("id, ticker, deleted_at")
    .eq("id", commentId)
    .maybeSingle();

  if (loadError || !comment) {
    if (loadError) console.error("admin comment lookup failed", loadError);
    return;
  }

  if (comment.deleted_at) return;

  const { error } = await supabaseAdmin
    .from("company_comments")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: `admin:${userId}`,
    })
    .eq("id", commentId)
    .is("deleted_at", null);

  if (error) {
    console.error("admin comment moderation failed", error);
    return;
  }

  revalidatePath("/admin/comments");
  revalidatePath("/admin/reports");
  if (comment.ticker) revalidatePath(`/company/${comment.ticker}`);
}
