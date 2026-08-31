import { NextRequest, NextResponse } from "next/server";

const USED_KEY = "checkpaid:used";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** どの決済をどの注文に使ったか。決済ID → 注文ID */
async function getUsed(): Promise<Record<string, string>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, string>>(USED_KEY)) ?? {};
}

async function markUsed(paymentId: string, orderId: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const used = await getUsed();
  used[paymentId] = orderId;
  await store.set(USED_KEY, used);
}

export const runtime = "nodejs";
export const maxDuration = 60;

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function hdrs() {
  const token = process.env.SQUARE_ACCESS_TOKEN || "";
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// カード決済はSquareアプリに飛んで行う。決済したあとブラウザに戻らずに
// Squareアプリを開いたままにしていると、こちらへ戻る合図が届かず、
// お金は受け取っているのに注文が開いたまま残る。
//
// この画面から「Squareに同じ金額の支払いがあるか」を見に行き、
// 見つかれば注文を閉じる。無ければ「まだ払われていない」と伝える。
//
// 同じ金額の注文が複数開いていることがあるので、一度使った決済は
// 使い回さない。記録しておいて次からは候補から外す。
// （これをやらないと、決済1件で複数の注文を閉じてしまう）
//
// POST { order_id }
export async function POST(req: NextRequest) {
  try {
    const { order_id } = (await req.json()) as { order_id?: string };
    if (!order_id) {
      return NextResponse.json({ error: "order_id が必要です" }, { status: 400 });
    }

    const orderRes = await fetch(`${SQUARE_API}/orders/${order_id}`, { headers: hdrs() });
    const orderData = await orderRes.json();
    const order = orderData.order;
    if (!order) {
      return NextResponse.json(
        { error: orderData.errors?.[0]?.detail || "注文が見つかりません" },
        { status: 404 },
      );
    }
    if (order.state !== "OPEN") {
      return NextResponse.json({
        ok: true,
        alreadyClosed: true,
        state: order.state,
        message: `この注文はすでに${order.state === "COMPLETED" ? "完了" : "取消"}になっています。`,
      });
    }

    const total = order.total_money?.amount ?? 0;
    // 注文を作った前後の支払いだけを見る。ここを広く取ると件数が多くなり、
    // 100件の枠から古い決済がこぼれて「見つからない」ことになる。
    const created = Date.parse(order.created_at);
    const from = new Date(created - 10 * 60_000).toISOString();
    const to = new Date(Math.min(created + 12 * 3600_000, Date.now() + 60_000)).toISOString();

    const all: any[] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const url =
        `${SQUARE_API}/payments?begin_time=${encodeURIComponent(from)}` +
        `&end_time=${encodeURIComponent(to)}&sort_order=ASC&limit=100` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const payRes = await fetch(url, { headers: hdrs() });
      const payData = await payRes.json();
      if (!payRes.ok) {
        return NextResponse.json(
          { error: payData.errors?.[0]?.detail || "支払いを調べられませんでした" },
          { status: payRes.status },
        );
      }
      all.push(...(payData.payments || []));
      cursor = payData.cursor || "";
      if (!cursor) break;
    }

    // Squareアプリで決済すると、その決済はアプリ側が作った別の注文にひも付く。
    // こちらの注文IDとは一致しないので、金額と時刻の近さで探す。
    // ただし他の注文に使った決済は除く。
    const used = await getUsed();
    const payments = all
      .filter((p: any) => !used[p.id] || used[p.id] === order_id)
      .filter(
        (p: any) =>
          (p.status === "COMPLETED" || p.status === "APPROVED") &&
          (p.amount_money?.amount ?? 0) === total,
      )
      .sort((a: any, b: any) => {
        // この注文にひも付いているものが最優先。次に注文時刻に近いもの。
        const link = (p: any) => (p.order_id === order_id ? 0 : 1);
        if (link(a) !== link(b)) return link(a) - link(b);
        return (
          Math.abs(Date.parse(a.created_at) - created) -
          Math.abs(Date.parse(b.created_at) - created)
        );
      });

    if (payments.length === 0) {
      // 同額の決済はあるが、すでに他の注文に使われていた場合は理由を分けて伝える
      const taken = all.filter(
        (p: any) =>
          (p.status === "COMPLETED" || p.status === "APPROVED") &&
          (p.amount_money?.amount ?? 0) === total &&
          used[p.id] &&
          used[p.id] !== order_id,
      );
      return NextResponse.json({
        ok: true,
        paid: false,
        total,
        message: taken.length
          ? `¥${total.toLocaleString()} の決済はありますが、すでに別の注文に使われています。` +
            "この注文はまだ会計が済んでいない可能性があります。"
          : `¥${total.toLocaleString()} の支払いはSquareに見つかりませんでした。` +
            "まだ会計が済んでいないか、金額が違う可能性があります。",
      });
    }

    // 支払いが見つかったので、開いたままの注文を閉じる。
    // 売上はSquare側の決済で計上済みなので、二重にしないためCANCELEDで閉じる。
    const cancelRes = await fetch(`${SQUARE_API}/orders/${order_id}`, {
      method: "PUT",
      headers: hdrs(),
      body: JSON.stringify({
        order: { version: order.version, state: "CANCELED" },
        idempotency_key: `chk_${order_id.slice(-10)}_${Date.now().toString(36)}`,
      }),
    });
    if (!cancelRes.ok) {
      const cd = await cancelRes.json().catch(() => ({}));
      return NextResponse.json({
        ok: true,
        paid: true,
        closed: false,
        total,
        message:
          "支払いは見つかりましたが、注文を閉じられませんでした。" +
          (cd.errors?.[0]?.detail ? `（${cd.errors[0].detail}）` : ""),
      });
    }

    const p = payments[0];
    // この決済は使い切った印を付ける。次の注文では候補に出さない。
    await markUsed(p.id, order_id);
    return NextResponse.json({
      ok: true,
      paid: true,
      closed: true,
      total,
      paidAt: p.created_at,
      method: p.source_type,
      message: `¥${total.toLocaleString()} の支払いを確認しました。注文を閉じました。`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "確認に失敗" },
      { status: 500 },
    );
  }
}
