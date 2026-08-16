import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/line/friendship?userId=U...
// そのユーザーが公式アカウントを友だち追加しているかをサーバー側で判定する。
//
// liff.getFriendship() はLINEログインチャネルと公式アカウントのリンク状況や
// 実行環境によって動かないことがあるため、Messaging APIのプロフィール取得
// （友だちでない/ブロック中なら404を返す）で確実に判定する。
// LIFFのuserIdとMessaging APIのuserIdは同じプロバイダー内なら一致する。
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!userId) {
    return NextResponse.json({ error: "userId が必要です" }, { status: 400 });
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  if (!token) {
    // 未設定なら判定不能として返す（UI側は従来どおり友だち追加ボタンを出す）
    return NextResponse.json({ known: false });
  }
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      return NextResponse.json({ known: true, isFriend: true });
    }
    if (res.status === 404) {
      // 友だち未追加、またはブロック中
      return NextResponse.json({ known: true, isFriend: false });
    }
    return NextResponse.json({ known: false, status: res.status });
  } catch {
    return NextResponse.json({ known: false });
  }
}
