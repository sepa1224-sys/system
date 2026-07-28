import { NextRequest, NextResponse } from "next/server";
import { isGoogleConnected, gmailSearch } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cronが毎朝6時(JST)に叩く
// GET /api/cron/amazon-sync

type ParsedOrder = {
  orderNumber: string;
  orderDate: string; // メール受信日
  items: { name: string; quantity: number; price: number }[];
  total: number;
};

function parseAmazonMail(body: string, date: string): ParsedOrder | null {
  // 注文番号
  const orderMatch = body.match(/注文番号\s*\n?\s*([\d-]+)/);
  if (!orderMatch) return null;

  const items: { name: string; quantity: number; price: number }[] = [];

  // 商品パターン: "* 商品名\n  数量: N\n  NNNN JPY"
  const itemRegex = /\*\s+(.+?)\n\s*数量:\s*(\d+)\n\s*(\d+)\s*JPY/g;
  let match;
  while ((match = itemRegex.exec(body)) !== null) {
    items.push({
      name: match[1].trim(),
      quantity: parseInt(match[2]),
      price: parseInt(match[3]),
    });
  }

  if (items.length === 0) return null;

  // 合計
  const totalMatch = body.match(/合計\s*\n?\s*(\d+)\s*JPY/);
  const total = totalMatch ? parseInt(totalMatch[1]) : items.reduce((s, i) => s + i.price, 0);

  return {
    orderNumber: orderMatch[1],
    orderDate: date,
    items,
    total,
  };
}

export async function GET(req: NextRequest) {
  // Vercel Cron認証（CRON_SECRET）
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続", synced: 0 });
  }

  try {
    // 過去3日分のAmazon注文確認メールを検索
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateStr = `${threeDaysAgo.getFullYear()}/${String(threeDaysAgo.getMonth() + 1).padStart(2, "0")}/${String(threeDaysAgo.getDate()).padStart(2, "0")}`;

    const mails = await gmailSearch(
      `from:auto-confirm@amazon.co.jp after:${dateStr}`,
      20,
    );

    const orders: ParsedOrder[] = [];
    for (const m of mails) {
      const parsed = parseAmazonMail(m.body, m.date);
      if (parsed) orders.push(parsed);
    }

    // KVに処理済み注文番号を保存して重複防止
    const { createClient } = await import("@vercel/kv");
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      return NextResponse.json({ error: "KV未設定" }, { status: 500 });
    }
    const store = createClient({ url, token });

    const processedKey = "amazon:processed_orders";
    const processed = (await store.smembers(processedKey)) as string[];

    const newOrders = orders.filter((o) => !processed.includes(o.orderNumber));

    if (newOrders.length === 0) {
      return NextResponse.json({
        message: "新しい注文はありません",
        synced: 0,
        checked: orders.length,
      });
    }

    // 新規注文をKVに保存（注文ログとして）
    const logKey = "amazon:order_log";
    const existingLog = (await store.get<ParsedOrder[]>(logKey)) || [];
    existingLog.push(...newOrders);
    await store.set(logKey, existingLog);

    // 処理済みマーク
    for (const o of newOrders) {
      await store.sadd(processedKey, o.orderNumber);
    }

    return NextResponse.json({
      message: `${newOrders.length}件の新規注文を同期しました`,
      synced: newOrders.length,
      orders: newOrders.map((o) => ({
        orderNumber: o.orderNumber,
        total: o.total,
        items: o.items.map((i) => `${i.name} ×${i.quantity} ¥${i.price}`),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "同期失敗" },
      { status: 500 },
    );
  }
}
