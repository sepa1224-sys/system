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
    const { order_id, amount, tendered } = (await req.json()) as {
      order_id: string;
      amount: number;
      tendered: number;
    };
    if (!order_id || !amount) {
      return NextResponse.json({ error: "order_id と amount が必要" }, { status: 400 });
    }

    const locationId = await getLocationId();
    if (!locationId) return NextResponse.json({ error: "ロケーション未設定" }, { status: 500 });

    const tenderedAmount = tendered || amount;
    const changeBack = tenderedAmount - amount;

    // Square Payments API で現金決済を作成
    const payRes = await fetch(`${SQUARE_API}/payments`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        idempotency_key: `pay_${order_id}_${Date.now()}`,
        source_id: "CASH",
        amount_money: {
          amount,
          currency: "JPY",
        },
        cash_details: {
          buyer_tendered_money: {
            amount: tenderedAmount,
            currency: "JPY",
          },
          change_back_money: {
            amount: Math.max(0, changeBack),
            currency: "JPY",
          },
        },
        order_id,
        location_id: locationId,
      }),
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
