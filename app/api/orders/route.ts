import { NextRequest, NextResponse } from "next/server";
import type { PendingOrder } from "../cron/amazon-sync/route";

export const runtime = "nodejs";

const KV_KEY = "orders:pending";

async function getStore() {
  const { createClient } = await import("@vercel/kv");
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("KV未設定");
  return createClient({ url, token });
}

// GET: 注文一覧（?status=pending|confirmed|skipped|all）
export async function GET(req: NextRequest) {
  try {
    const store = await getStore();
    const all = (await store.get<PendingOrder[]>(KV_KEY)) || [];
    const status = req.nextUrl.searchParams.get("status") || "all";

    const filtered = status === "all" ? all : all.filter((o) => o.status === status);

    // 新しい順
    filtered.sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1));

    const summary = {
      pending: all.filter((o) => o.status === "pending").length,
      confirmed: all.filter((o) => o.status === "confirmed").length,
      skipped: all.filter((o) => o.status === "skipped").length,
      total: all.length,
    };

    return NextResponse.json({ summary, orders: filtered });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

// POST: 注文のステータス・仕訳情報を更新
// body: { id, status, account?, category? }
export async function POST(req: NextRequest) {
  try {
    const { id, status, account, category } = (await req.json()) as {
      id: string;
      status: "confirmed" | "skipped";
      account?: string;
      category?: string;
    };

    const store = await getStore();
    const all = (await store.get<PendingOrder[]>(KV_KEY)) || [];
    const idx = all.findIndex((o) => o.id === id);
    if (idx < 0) {
      return NextResponse.json({ error: "注文が見つかりません" }, { status: 404 });
    }

    all[idx].status = status;
    if (account) all[idx].account = account;
    if (category) all[idx].category = category;
    all[idx].confirmedAt = new Date().toISOString();

    await store.set(KV_KEY, all);

    return NextResponse.json({ ok: true, order: all[idx] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
