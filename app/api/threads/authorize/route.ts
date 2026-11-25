import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, issueState } from "@/lib/threads";

export const runtime = "nodejs";

// Threadsにつなぐ入口。戻り先の /api/threads/callback は合言葉なしで開けるので、stateで本人の操作かを確かめる
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
  try {
    await issueState(nonce);
    const res = NextResponse.redirect(authorizeUrl(origin, nonce));
    res.cookies.set("th_state", nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
    return res;
  } catch (e) {
    return NextResponse.redirect(`${origin}/threads?error=${encodeURIComponent(e instanceof Error ? e.message : "エラー")}`);
  }
}
