import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const allowedEvents = new Set([
  "page_view",
  "pricing_click",
  "pricing_view",
  "checkout_start",
  "checkout_complete",
]);

function text(value: unknown, max = 300) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  const body = await req.json().catch(() => null);
  const eventName = text(body?.eventName, 80);

  if (!eventName || !allowedEvents.has(eventName)) {
    return NextResponse.json({ error: "invalid event" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("acquisition_events").insert({
    event_name: eventName,
    path: text(body?.path),
    clerk_user_id: userId,
    anonymous_id: text(body?.anonymousId, 120),
    session_id: text(body?.sessionId, 120),
    utm_source: text(body?.utmSource, 120),
    utm_medium: text(body?.utmMedium, 120),
    utm_campaign: text(body?.utmCampaign, 180),
    utm_content: text(body?.utmContent, 180),
    referrer: text(body?.referrer, 500),
    metadata:
      body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
  });

  if (error) {
    return NextResponse.json({ tracked: false }, { status: 202 });
  }

  return NextResponse.json({ tracked: true });
}
