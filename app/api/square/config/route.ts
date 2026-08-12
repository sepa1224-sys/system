import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET: Square設定（クライアント向け）
// Application IDは公開情報なので直接記載
export async function GET() {
  return NextResponse.json({
    appId: process.env.SQUARE_APPLICATION_ID || "sq0idp-xQU4ylBnqtNKgtjCPIsw8A",
  });
}
