import { NextResponse } from "next/server";
import { tick } from "@/lib/threads";

export const runtime = "nodejs";
export const maxDuration = 300;

// Threadsの自動投稿。5分おきにVercelのcronが呼ぶ。することが無ければ何もしない。
export async function GET() {
  try {
    return NextResponse.json(await tick());
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "失敗" }, { status: 500 });
  }
}
