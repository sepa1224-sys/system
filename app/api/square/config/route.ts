import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET: Square設定（クライアント向け）
// Application IDは公開情報なので直接記載
export async function GET() {
  return NextResponse.json({
    appId: process.env.SQUARE_APPLICATION_ID || "sq0idp-xQU4ylBnqtNKgtjCPIsw8A",
    // Square POS APIのcallback_url。Developer Dashboardの
    // 「Web callback URLs」に登録した文字列と完全一致していないとPOSが弾く。
    // 端末がどのURLでアプリを開いていても同じ値を送るため、ここで固定する。
    callbackUrl:
      process.env.SQUARE_POS_CALLBACK_URL || "https://flat-keihi.vercel.app/table",
  });
}
