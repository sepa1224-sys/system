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

// お客さんが席を移ったときに、注文をそのまま別のテーブルへ付け替える。
// テーブルはSquareの ticket_name で表しているので、そこだけ書き換える。
// POST { order_id, to: "B2", version? }
//
// versionは省略してよい。画面が持っているversionは注文を足した直後などに
// すぐ古くなり、そのまま送るとSquareに弾かれる（VERSION_MISMATCH）。
// 送らなければサーバーが最新を取りに行くので、席の移動が失敗しなくなる。
export async function POST(req: NextRequest) {
  try {
    const { order_id, version, to } = (await req.json()) as {
      order_id?: string;
      version?: number;
      to?: string;
    };
    if (!order_id || !to) {
      return NextResponse.json(
        { error: "order_id, to が必要です" },
        { status: 400 },
      );
    }

    let useVersion = version;
    if (useVersion == null) {
      const cur = await fetch(`${SQUARE_API}/orders/${order_id}`, { headers: hdrs() });
      const curData = await cur.json();
      if (!cur.ok) {
        return NextResponse.json(
          { error: curData.errors?.[0]?.detail || `注文が読めません(${cur.status})` },
          { status: cur.status },
        );
      }
      useVersion = curData.order?.version;
    }

    const res = await fetch(`${SQUARE_API}/orders/${order_id}`, {
      method: "PUT",
      headers: hdrs(),
      body: JSON.stringify({
        order: {
          version: useVersion,
          ticket_name: to,
        },
        idempotency_key: `move_${order_id}_${Date.now()}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        {
          error: data.errors?.[0]?.detail || `テーブル移動に失敗(${res.status})`,
          details: data.errors,
        },
        { status: res.status },
      );
    }
    return NextResponse.json({
      ok: true,
      order_id,
      to,
      version: data.order?.version,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "テーブル移動に失敗" },
      { status: 500 },
    );
  }
}
