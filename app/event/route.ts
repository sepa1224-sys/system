import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// /event : LIFFの固定エンドポイント。
// いま開催中のイベントページへ転送する。転送先はKVの event:current で変えられるので、
// LIFF側のURLは二度と触らなくていい。

const KEY = "event:current";
const DEFAULT_PATH = "/natsumatsuri";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export async function GET(req: NextRequest) {
  let path = DEFAULT_PATH;
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
