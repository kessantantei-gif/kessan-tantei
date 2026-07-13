import { NextResponse } from "next/server";
import { Resend } from "resend";

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

    const type = body.type ?? "その他";
    const email = body.email ?? "未入力";
    const message = body.message ?? "";

    if (!message.trim()) {
      return NextResponse.json(
        { error: "message required" },
        { status: 400 }
      );
    }

    const resend = new Resend(resendApiKey);

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: feedbackToEmail,
      subject: `【決算探偵 Feedback】${type}`,
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
