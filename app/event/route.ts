import { NextRequest, NextResponse } from "next/server";
import { currentEvent } from "@/lib/events";

export const runtime = "nodejs";

// /event : LIFFの固定エンドポイント。
// いま受け付けているイベントのページへ転送する。
// LIFF側のURLは二度と触らなくていい。
//
// 転送先は登録簿（lib/events.ts）の開催日から自動で決まる。
// KVの event:current に入れておけば、そちらが優先される（臨時に別のページを
// 出したいときや、登録簿に無いページへ向けたいときのため）。

const KEY = "event:current";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export async function GET(req: NextRequest) {
  const ev = currentEvent();
  let path = ev ? `/event/${ev.slug}` : "/natsumatsuri";
  try {
    const store = await kv();
    if (store) {
      const p = await store.get<string>(KEY);
      if (p && p.startsWith("/")) path = p;
    }
  } catch {
    /* KVが読めなくてもデフォルトに転送 */
  }
  // liff.state などのクエリはそのまま引き継ぐ
  const url = new URL(path + req.nextUrl.search, req.nextUrl.origin);
  return NextResponse.redirect(url, 302);
}

// POST { path: "/natsumatsuri" } : 転送先を変更（内部用）
export async function POST(req: NextRequest) {
  try {
    const { path } = (await req.json()) as { path?: string };
    if (!path || !path.startsWith("/")) {
      return NextResponse.json({ error: "path は / から始めてください" }, { status: 400 });
    }
    const store = await kv();
    if (!store) return NextResponse.json({ error: "KV未設定" }, { status: 500 });
    await store.set(KEY, path);
    return NextResponse.json({ ok: true, path });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "変更に失敗" },
      { status: 500 },
    );
  }
}
