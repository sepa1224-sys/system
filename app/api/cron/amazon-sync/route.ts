import { NextRequest, NextResponse } from "next/server";
import { isGoogleConnected, gmailSearch, type Mail } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

// 毎朝6時(JST)にVercel Cronが叩く
// Amazon以外の注文メールも取得して「未処理注文」としてKVに溜める

export type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

export type PendingOrder = {
  id: string;           // mailId_index で一意
  mailId: string;
  source: string;       // Amazon, ASKUL, 楽天, カクヤス, リカマン, その他
  orderNumber: string;
  orderDate: string;
  items: OrderItem[];
  total: number;
  subject: string;
  snippet: string;
  // ユーザーが確認後に埋める
  status: "pending" | "confirmed" | "skipped";
  account?: string;     // 勘定科目
  category?: string;    // 仕入れ表カテゴリ
  confirmedAt?: string;
};

const KV_KEY = "orders:pending";

// ─── メールパーサー ───

function parseAmazon(body: string, mail: Mail): PendingOrder | null {
  const orderMatch = body.match(/注文番号\s*\n?\s*([\d-]+)/);
  if (!orderMatch) return null;

  const items: OrderItem[] = [];
  const itemRegex = /\*\s+(.+?)\n\s*数量:\s*(\d+)\n\s*(\d+)\s*JPY/g;
  let m;
  while ((m = itemRegex.exec(body)) !== null) {
    items.push({ name: m[1].trim(), quantity: parseInt(m[2]), price: parseInt(m[3]) });
  }
  if (items.length === 0) return null;

  const totalMatch = body.match(/合計\s*\n?\s*(\d+)\s*JPY/);
  return {
    id: `${mail.id}_0`,
    mailId: mail.id,
    source: "Amazon",
    orderNumber: orderMatch[1],
    orderDate: mail.date,
    items,
    total: totalMatch ? parseInt(totalMatch[1]) : items.reduce((s, i) => s + i.price, 0),
    subject: mail.subject,
    snippet: mail.snippet,
    status: "pending",
  };
}

function parseAskul(body: string, mail: Mail): PendingOrder | null {
  // ASKULの注文確認メール
  const orderMatch = body.match(/注文番号[：:]\s*([\d-]+)/);
  const items: OrderItem[] = [];

  // 「商品名  数量  金額」のパターン
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const priceMatch = lines[i].match(/([,\d]+)\s*円/);
    if (priceMatch && i > 0) {
      const name = lines[i - 1]?.trim();
      if (name && name.length > 2 && !name.includes("合計") && !name.includes("送料")) {
        items.push({ name, quantity: 1, price: parseInt(priceMatch[1].replace(",", "")) });
      }
    }
  }

  if (items.length === 0) return null;

  return {
    id: `${mail.id}_0`,
    mailId: mail.id,
    source: "ASKUL",
    orderNumber: orderMatch?.[1] || mail.id.slice(0, 12),
    orderDate: mail.date,
    items,
    total: items.reduce((s, i) => s + i.price, 0),
    subject: mail.subject,
    snippet: mail.snippet,
    status: "pending",
  };
}

/**
 * モノタロウの注文メール。明細はこの形で並んでいる:
 *   注文コード：27862039
 *   商品　　　：EBM 木製 タグスティック 64301 小 1パック(100本)
 *   単価×数量：@￥1,098(外税) × 2
 * 「配送費」も1明細として入るので、そのまま拾う。
 */
function parseMonotaro(body: string, mail: Mail): PendingOrder | null {
  const items: OrderItem[] = [];
  const re =
    /商品[\s　]*[：:]\s*(.+?)\r?\n\s*単価×数量[\s　]*[：:]\s*@[¥￥]?\s*([,\d]+)\s*(?:\([^)]*\))?\s*[×x]\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const unit = parseInt(m[2].replace(/,/g, ""), 10);
    const qty = parseInt(m[3], 10) || 1;
    items.push({ name: m[1].trim().slice(0, 80), quantity: qty, price: unit * qty });
  }
  if (items.length === 0) return null;

  const orderNo = /注文書番号[\s　]*[：:]\s*(\d+)/.exec(body)?.[1] || mail.id.slice(0, 12);
  const orderDate = /ご注文日[\s　]*[：:]\s*([\d/]+)/.exec(body)?.[1] || mail.date;
  // 外税表記なので明細の単純合計は請求額とずれる。メールに合計があればそちらを使う。
  const totalM = /合計[^\d]*([,\d]+)/.exec(body);
  const total = totalM
    ? parseInt(totalM[1].replace(/,/g, ""), 10)
    : items.reduce((n, i) => n + i.price, 0);

  return {
    id: `${mail.id}_0`,
    mailId: mail.id,
    source: "モノタロウ",
    orderNumber: orderNo,
    orderDate,
    items,
    total,
    subject: mail.subject,
    snippet: mail.snippet,
    status: "pending",
  };
}

function parseGeneric(body: string, mail: Mail, source: string): PendingOrder | null {
  // 汎用パーサー: 金額っぽいものを拾う
  const items: OrderItem[] = [];
  const totalMatch = body.match(/合計[金額]*[：:\s]*[¥￥]?\s*([,\d]+)/);
  const total = totalMatch ? parseInt(totalMatch[1].replace(",", "")) : 0;

  // 件名から概要を取得
  if (total > 0) {
    items.push({
      name: mail.subject.replace(/^(Re:|Fwd:|注文|ご注文|確認)[：:\s]*/i, "").slice(0, 60),
      quantity: 1,
      price: total,
    });
  }

  if (items.length === 0) return null;

  return {
    id: `${mail.id}_0`,
    mailId: mail.id,
    source,
    orderNumber: mail.id.slice(0, 12),
    orderDate: mail.date,
    items,
    total,
    subject: mail.subject,
    snippet: mail.snippet,
    status: "pending",
  };
}

// 送信元 → source判定
function detectSource(from: string, subject: string): string | null {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  if (f.includes("amazon")) return "Amazon";
  if (f.includes("askul") || s.includes("アスクル")) return "ASKUL";
  if (f.includes("rakuten") || f.includes("楽天")) return "楽天";
  if (f.includes("kakuyasu") || s.includes("カクヤス")) return "カクヤス";
  if (f.includes("likaman") || s.includes("リカマン")) return "リカマン";
  if (f.includes("monotaro") || s.includes("モノタロウ")) return "モノタロウ";
  if (f.includes("yodobashi") || s.includes("ヨドバシ")) return "ヨドバシ";
  // 注文確認系キーワード
  if (s.includes("注文") || s.includes("ご注文") || s.includes("order")) return "その他";
  return null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続", synced: 0 });
  }

  try {
    // 既定は3日分。過去の取りこぼしを埋めるときは ?days=60&max=50 のように広げる。
    const sp = req.nextUrl.searchParams;
    const days = Math.min(Math.max(Number(sp.get("days") || "3"), 1), 400);
    const perQuery = Math.min(Math.max(Number(sp.get("max") || "10"), 1), 100);
    // パーサーを直したあと、取り込み済みのメールを読み直すためのフラグ。
    // 同じmailIdの注文は差し替える。
    const reparse = sp.get("reparse") === "1";

    const from = new Date();
    from.setDate(from.getDate() - days);
    const dateStr = `${from.getFullYear()}/${String(from.getMonth() + 1).padStart(2, "0")}/${String(from.getDate()).padStart(2, "0")}`;

    // 注文確認メールを広く検索
    const queries = [
      `from:auto-confirm@amazon.co.jp after:${dateStr}`,
      `from:order@askul.co.jp after:${dateStr}`,
      `subject:ご注文 after:${dateStr}`,
      `subject:注文確認 after:${dateStr}`,
    ];

    const allMails = new Map<string, Mail>();
    for (const q of queries) {
      const mails = await gmailSearch(q, perQuery);
      for (const m of mails) allMails.set(m.id, m);
    }

    // KV
    const { createClient } = await import("@vercel/kv");
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return NextResponse.json({ error: "KV未設定" }, { status: 500 });
    const store = createClient({ url, token });

    // 処理済みmailIdセット
    const processedKey = "orders:processed_mails";
    const processed = new Set((await store.smembers(processedKey)) as string[]);

    const existing = (await store.get<PendingOrder[]>(KV_KEY)) || [];
    const newOrders: PendingOrder[] = [];

    for (const mail of allMails.values()) {
      if (!reparse && processed.has(mail.id)) continue;

      const source = detectSource(mail.from, mail.subject);
      if (!source) continue;

      let order: PendingOrder | null = null;
      if (source === "Amazon") {
        order = parseAmazon(mail.body, mail);
      } else if (source === "ASKUL") {
        order = parseAskul(mail.body, mail);
      } else if (source === "モノタロウ") {
        // 明細が読めなければ汎用パーサーに落とす
        order = parseMonotaro(mail.body, mail) ?? parseGeneric(mail.body, mail, source);
      } else {
        order = parseGeneric(mail.body, mail, source);
      }

      if (order) {
        newOrders.push(order);
      }

      await store.sadd(processedKey, mail.id);
    }

    if (newOrders.length > 0) {
      // 同じメールから作った注文は差し替える（reparseで読み直したときに重複させない）。
      // ただし確定済みのものは触らない。
      const ids = new Set(newOrders.map((o) => o.id));
      const kept = existing.filter((o) => !ids.has(o.id) || o.status !== "pending");
      const skipped = newOrders.filter((o) =>
        existing.some((e) => e.id === o.id && e.status !== "pending"),
      );
      await store.set(KV_KEY, [
        ...kept,
        ...newOrders.filter((o) => !skipped.some((x) => x.id === o.id)),
      ]);
    }

    return NextResponse.json({
      message: newOrders.length > 0
        ? `${newOrders.length}件の新規注文を取得しました`
        : "新しい注文はありません",
      synced: newOrders.length,
      checked: allMails.size,
      orders: newOrders.map((o) => ({
        source: o.source,
        orderNumber: o.orderNumber,
        total: o.total,
        items: o.items.length,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "同期失敗" }, { status: 500 });
  }
}
