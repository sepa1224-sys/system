import { NextRequest, NextResponse } from "next/server";
import { isGoogleConnected, gmailSearch } from "@/lib/google";

export const runtime = "nodejs";

// GET /api/gmail/search?q=from:amazon&max=5
export async function GET(req: NextRequest) {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続" }, { status: 400 });
  }
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q") || "from:auto-confirm@amazon.co.jp";
    const max = Number(sp.get("max") || "5");
    const mails = await gmailSearch(q, max);
    return NextResponse.json({ count: mails.length, mails });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
