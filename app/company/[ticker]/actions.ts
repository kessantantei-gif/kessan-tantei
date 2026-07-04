"use server";

import { revalidatePath } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

const NG_WORDS = ["死ね", "殺す", "fuck", "バカ", "アホ"];

function containsNgWord(text: string) {
  const lower = text.toLowerCase();
  return NG_WORDS.some((word) => lower.includes(word.toLowerCase()));
}

async function getDisplayName(userId: string) {
  const user = await currentUser();

  const fallbackName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "ログインユーザー";

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (data?.display_name) return data.display_name;

  await supabaseAdmin.from("profiles").upsert({
    clerk_user_id: userId,
    display_name: fallbackName,
    updated_at: new Date().toISOString(),
  });

  return fallbackName;
}

export async function createComment(formData: FormData) {
  const { userId } = await auth();

  if (!userId) return;

  const ticker = String(formData.get("ticker") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const replyToIdRaw = String(formData.get("reply_to_id") || "").trim();
  const replyToId = replyToIdRaw || null;

  if (!ticker || !body) return;
  if (body.length > 1000) return;
  if (containsNgWord(body)) return;

  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

  const { data: recentComments } = await supabaseAdmin
    .from("company_comments")
    .select("id")
    .eq("ticker", ticker)
    .eq("clerk_user_id", userId)
    .gte("created_at", oneMinuteAgo)
    .limit(1);

  if ((recentComments ?? []).length > 0) return;

  const nickname = await getDisplayName(userId);

  const { error } = await supabaseAdmin.from("company_comments").insert({
    ticker,
    nickname,
    body,
    clerk_user_id: userId,
    reply_to_id: replyToId,
  });

  if (error) {
    console.error(error);
    return;
  }

  revalidatePath(`/company/${ticker}`);
}

export async function reactComment(formData: FormData) {
  const { userId } = await auth();

  if (!userId) return;

  const ticker = String(formData.get("ticker") || "").trim();
  const commentId = String(formData.get("comment_id") || "").trim();
  const reactionType = String(formData.get("reaction_type") || "").trim();

  if (!ticker || !commentId) return;
  if (reactionType !== "like" && reactionType !== "report") return;

  const { data: existing } = await supabaseAdmin
    .from("company_comment_reactions")
    .select("id")
    .eq("comment_id", commentId)
    .eq("reaction_type", reactionType)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("company_comment_reactions")
      .delete()
      .eq("id", existing.id);

    if (error) console.error(error);

    revalidatePath(`/company/${ticker}`);
    return;
  }

  const { error } = await supabaseAdmin
    .from("company_comment_reactions")
    .insert({
      comment_id: commentId,
      reaction_type: reactionType,
      clerk_user_id: userId,
    });

  if (error) {
    console.error(error);
    return;
  }

  revalidatePath(`/company/${ticker}`);
}

export async function deleteComment(formData: FormData) {
  const { userId } = await auth();

  if (!userId) return;

  const ticker = String(formData.get("ticker") || "").trim();
  const commentId = String(formData.get("comment_id") || "").trim();

  if (!ticker || !commentId) return;

  const { data: comment } = await supabaseAdmin
    .from("company_comments")
    .select("id, clerk_user_id, deleted_at")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) return;
  if (comment.deleted_at) return;
  if (comment.clerk_user_id !== userId) return;

  const { error } = await supabaseAdmin
    .from("company_comments")
    .update({
      body: "",
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq("id", commentId)
    .eq("clerk_user_id", userId);

  if (error) {
    console.error(error);
    return;
  }

  revalidatePath(`/company/${ticker}`);
}

export async function createFeedback(formData: FormData) {
  const { userId } = await auth();

  const type = String(formData.get("type") || "other").trim();
  const email = String(formData.get("email") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!message) return;
  if (message.length > 2000) return;
  if (containsNgWord(message)) return;

  const allowedTypes = ["bug", "request", "question", "other"];
  const safeType = allowedTypes.includes(type) ? type : "other";

  const { error } = await supabaseAdmin.from("feedbacks").insert({
    clerk_user_id: userId || null,
    email: email || null,
    type: safeType,
    message,
    status: "open",
  });

  if (error) {
    console.error(error);
  }
}