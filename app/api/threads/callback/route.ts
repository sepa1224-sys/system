import { NextRequest, NextResponse } from "next/server";
import { connectThreads } from "@/lib/threads";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = req.cookies.get("th_state")?.value;
  if (!state || state !== url.searchParams.get("state")) {
    return new NextResponse("接続をやり直してください。", { status: 400 });
  }
  const code = url.searchParams.get("code");
  let note = "connected=1";
  try {
    if (!code) throw new Error(url.searchParams.get("error_description") || "許可されませんでした");
    await connectThreads(url.origin, code);
  } catch (e) {
    note = `error=${encodeURIComponent(e instanceof Error ? e.message : "エラー")}`;
  }
  const res = NextResponse.redirect(`${url.origin}/threads?${note}`);
  res.cookies.delete("th_state");
  return res;
}
