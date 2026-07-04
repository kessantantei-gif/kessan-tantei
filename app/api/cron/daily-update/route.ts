import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabaseAdmin.from("user_notifications").insert({
    clerk_user_id: "system",
    title: "日次更新チェック",
    body: "Cron endpoint reached.",
  });

  return NextResponse.json({
    ok: true,
    message: "daily-update cron endpoint is ready",
  });
}