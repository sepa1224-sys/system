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

async function getOrder(id: string) {
  const res = await fetch(`${SQUARE_API}/orders/${id}`, { headers: hdrs() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.errors?.[0]?.detail || `注文が読めません(${res.status})`);
  return data.order;
}

// お客さんが席を移ったときに、注文を別のテーブルへ付け替える。
//
// Squareは ticket_name をあとから書き換えても黙って元に戻す
// （リクエストは成功しversionも上がるのに、席名だけ変わらない）。
// なので「移動先に同じ注文を作り直して、元を閉じる」やり方にしている。
// 注文IDは変わるが、席・品目・金額は引き継がれる。
//
// POST { order_id, to: "B2" }
export async function POST(req: NextRequest) {
  try {
    const { order_id, to } = (await req.json()) as {
      order_id?: string;
      to?: string;
    };
    if (!order_id || !to) {
      return NextResponse.json({ error: "order_id, to が必要です" }, { status: 400 });
    }

    const from = await getOrder(order_id);
    const lines = from.line_items || [];
    if (lines.length === 0) {
      return NextResponse.json({ error: "移動する品目がありません" }, { status: 400 });
    }

    // 移動先に同じ内容で作り直す。税は作成側で品目名と店内/持ち帰りから付け直す。
    const items = lines.map((li: any) => ({
      catalog_object_id: li.catalog_object_id || "",
      quantity: parseInt(li.quantity) || 1,
      note: li.note || "",
      name: li.name || "",
    }));
    const createRes = await fetch(`${req.nextUrl.origin}/api/square/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: to, items }),
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      return NextResponse.json(
        { error: created.error || `移動先に作れませんでした(${createRes.status})` },
        { status: createRes.status },
      );
    }

    // 作れたので元の注文を閉じる。ここで失敗すると二重に残るのではっきり伝える。
    const cancelRes = await fetch(`${SQUARE_API}/orders/${order_id}`, {
      method: "PUT",
      headers: hdrs(),
      body: JSON.stringify({
        order: { version: from.version, state: "CANCELED" },
        idempotency_key: `mv_${order_id.slice(-10)}_${Date.now().toString(36)}`,
      }),
    });
    if (!cancelRes.ok) {
      const cd = await cancelRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            `${to} に移しましたが、元の席の注文を閉じられませんでした。` +
            "二重になっているので、元の席を全キャンセルしてください。" +
            (cd.errors?.[0]?.detail ? `（${cd.errors[0].detail}）` : ""),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      to,
      order_id: created.order?.id,
      total: created.order?.total ?? 0,
      moved: items.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "テーブル移動に失敗" },
      { status: 500 },
    );
  }
}
