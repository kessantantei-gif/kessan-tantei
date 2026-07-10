import { NextResponse } from "next/server";
import { getProStatus } from "@/lib/pro";

export async function GET() {
  const status = await getProStatus();

  return NextResponse.json({
    isLoggedIn: status.isLoggedIn,
    isPro: status.isPro,
  });
}
