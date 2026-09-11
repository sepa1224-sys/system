import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE, checkPassword, sessionToken, authEnabled } from "@/lib/siteAuth";

export const runtime = "nodejs";

// 合言葉を受け取ってCookieを配る。Cookieには合言葉そのものではなく署名を入れる。
export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!authEnabled()) {
    return NextResponse.json({ ok: true, note: "合言葉は未設定です" });
  }
  if (!checkPassword(password ?? "")) {
    return NextResponse.json({ error: "合言葉が違います" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}

// 端末からログアウトする
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
