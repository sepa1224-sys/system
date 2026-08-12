import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET: Square設定（クライアント向け）
export async function GET() {
  return NextResponse.json({
    appId: process.env.SQUARE_APPLICATION_ID || "",
  });
}
