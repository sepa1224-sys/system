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

// POST: 支払いをキャンセル
// body: { payment_id }
export async function POST(req: NextRequest) {
  try {
    const { payment_id } = (await req.json()) as { payment_id: string };
    if (!payment_id) {
      return NextResponse.json({ error: "payment_id が必要" }, { status: 400 });
    }

    const res = await fetch(`${SQUARE_API}/payments/${payment_id}/cancel`, {
      method: "POST",
      headers: hdrs(),
    });

    const data = await res.json();
    if (!res.ok) {
      // キャンセルできない場合はRefundを試す
      // まず支払い情報を取得して金額を確認
      const payInfoRes = await fetch(`${SQUARE_API}/payments/${payment_id}`, { headers: hdrs() });
      const payInfo = await payInfoRes.json();
      const amountMoney = payInfo.payment?.amount_money || { amount: 0, currency: "JPY" };

      const refRes = await fetch(`${SQUARE_API}/refunds`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({
          idempotency_key: `ref_${payment_id.slice(-10)}_${Date.now().toString(36)}`,
          payment_id,
          amount_money: amountMoney,
          reason: "テスト注文取消",
        }),
      });
      const refData = await refRes.json();
      if (!refRes.ok) {
        return NextResponse.json({
          error: refData.errors?.[0]?.detail || "取消失敗",
          details: refData.errors,
        }, { status: refRes.status });
      }
      return NextResponse.json({ ok: true, method: "refund", refund: refData.refund?.id });
    }

    return NextResponse.json({ ok: true, method: "cancel" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取消失敗" }, { status: 500 });
  }
}
