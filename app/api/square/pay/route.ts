import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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

async function getLocationId(): Promise<string> {
  const res = await fetch(`${SQUARE_API}/locations`, { headers: hdrs() });
  const data = await res.json();
  return data.locations?.[0]?.id || "";
}

// POST: 現金決済
// body: { order_id, amount, tendered }
// amount: 注文合計金額、tendered: お客さんから受け取った金額
export async function POST(req: NextRequest) {
  try {
    const { order_id, amount, tendered, method } = (await req.json()) as {
      order_id: string;
      amount: number;
      tendered: number;
      method?: string; // "cash" | "paypay"
    };
    if (!order_id) {
      return NextResponse.json({ error: "order_id が必要" }, { status: 400 });
    }
    // card_close は注文を閉じるだけで決済しないため、金額は不要。
    // （画面は amount:0 を送るので、!amount で弾くと必ず失敗していた）
    if (method !== "card_close" && !amount) {
      return NextResponse.json({ error: "order_id と amount が必要" }, { status: 400 });
    }

    const locationId = await getLocationId();
    if (!locationId) return NextResponse.json({ error: "ロケーション未設定" }, { status: 500 });

    const tenderedAmount = tendered || amount;
    const changeBack = tenderedAmount - amount;
    const idempKey = `p${order_id.slice(-12)}${Date.now().toString(36)}`;

    // カード決済後のOPEN注文クローズ（Square POSで決済済み）
    if (method === "card_close") {
      // CANCELEDへの更新にはversionが要るので、先に注文を取得する。
      const getRes = await fetch(`${SQUARE_API}/orders/${order_id}`, { headers: hdrs() });
      const getD = await getRes.json();
      const ver = getD.order?.version;
      if (!ver) {
        return NextResponse.json(
          { error: getD.errors?.[0]?.detail || "注文が見つかりません" },
          { status: 404 },
        );
      }
      const closeRes = await fetch(`${SQUARE_API}/orders/${order_id}`, {
        method: "PUT",
        headers: hdrs(),
        body: JSON.stringify({
          order: { state: "CANCELED", version: ver },
          idempotency_key: idempKey,
        }),
      });
      const closeD = await closeRes.json();
      if (!closeRes.ok) {
        return NextResponse.json(
          { error: closeD.errors?.[0]?.detail || "注文のクローズに失敗", details: closeD.errors },
          { status: closeRes.status },
        );
      }
      return NextResponse.json({ ok: true, method: "card_close" });
    }

    let payBody: any;
    if (method === "paypay") {
      // PayPay: 「その他のお支払い」として記録、メモに「pp」
      payBody = {
        idempotency_key: idempKey,
        source_id: "EXTERNAL",
        external_details: {
          type: "OTHER",
          source: "PayPay",
        },
        amount_money: { amount, currency: "JPY" },
        note: "PayPay",
        order_id,
        location_id: locationId,
      };
    } else {
      // 現金決済
      payBody = {
        idempotency_key: idempKey,
        source_id: "CASH",
        amount_money: { amount, currency: "JPY" },
        cash_details: {
          buyer_supplied_money: { amount: tenderedAmount, currency: "JPY" },
          change_back_money: { amount: Math.max(0, changeBack), currency: "JPY" },
        },
        order_id,
        location_id: locationId,
      };
    }

    const payRes = await fetch(`${SQUARE_API}/payments`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify(payBody),
    });

    const payData = await payRes.json();
    if (!payRes.ok) {
      return NextResponse.json({
        error: payData.errors?.[0]?.detail || `決済エラー ${payRes.status}`,
        details: payData.errors,
      }, { status: payRes.status });
    }

    return NextResponse.json({
      ok: true,
      payment: {
        id: payData.payment?.id,
        amount,
        tendered: tenderedAmount,
        change: Math.max(0, changeBack),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "決済失敗" }, { status: 500 });
  }
}
