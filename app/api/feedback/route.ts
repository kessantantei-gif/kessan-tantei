import { NextResponse } from "next/server";
import { Resend } from "resend";

const ALLOWED_TYPES = new Set([
  "不具合",
  "改善要望",
  "問い合わせ",
  "掲示板・権利侵害の通報",
  "その他",
]);

export async function POST(req: Request) {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const feedbackToEmail = process.env.FEEDBACK_TO_EMAIL;

    if (!resendApiKey || !feedbackToEmail) {
      console.error("Feedback email configuration is missing");
      return NextResponse.json(
        { error: "feedback service unavailable" },
        { status: 503 }
      );
    }

    const body = await req.json();

    const rawType = String(body.type ?? "その他").trim();
    const type = ALLOWED_TYPES.has(rawType) ? rawType : "その他";
    const email = String(body.email ?? "").trim().slice(0, 320) || "未入力";
    const message = String(body.message ?? "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "message required" },
        { status: 400 }
      );
    }

    if (message.length > 4000) {
      return NextResponse.json(
        { error: "message too long" },
        { status: 400 }
      );
    }

    const resend = new Resend(resendApiKey);
    const urgentPrefix = type === "掲示板・権利侵害の通報" ? "【要確認】" : "";

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: feedbackToEmail,
      subject: `${urgentPrefix}【決算探偵 Feedback】${type}`,
      text: `
種別: ${type}

返信先メール:
${email}

内容:
${message}
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
