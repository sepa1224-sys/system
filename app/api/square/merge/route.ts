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

// 相席・合流したときに、2つのテーブルの注文を1つにまとめる。
// 移動元の品目を移動先に足してから、移動元の注文を閉じる。
// 会計は移動先のテーブルで1回にまとまる。
//
// POST { from_order_id, to_order_id }
// versionは受け取らない。まとめる直前に最新を取り直すので、
// 画面が古くても失敗しない。
export async function POST(req: NextRequest) {
  try {
    const { from_order_id, to_order_id } = (await req.json()) as {
      from_order_id?: string;
      to_order_id?: string;
    };
    if (!from_order_id || !to_order_id) {
      return NextResponse.json(
        { error: "from_order_id と to_order_id が必要です" },
        { status: 400 },
      );
    }
    if (from_order_id === to_order_id) {
      return NextResponse.json({ error: "同じ注文はまとめられません" }, { status: 400 });
    }

    const [from, to] = await Promise.all([getOrder(from_order_id), getOrder(to_order_id)]);
    const lines = from.line_items || [];
    if (lines.length === 0) {
      return NextResponse.json({ error: "移動元に品目がありません" }, { status: 400 });
    }

    // 移動元の品目をそのまま移動先へ。カタログに無い品（金額入力）は
    // 名前と単価を持たせて作り直す。
    const lineItems = lines.map((li: any) => {
      const note = [li.note, `${from.ticket_name || "別テーブル"}から移動`]
        .filter(Boolean)
        .join(" / ")
        .slice(0, 500);
      if (li.catalog_object_id) {
        return {
          catalog_object_id: li.catalog_object_id,
          quantity: String(li.quantity || "1"),
          note,
        };
      }
      return {
        name: li.name || "商品",
        quantity: String(li.quantity || "1"),
        base_price_money: li.base_price_money ?? {
          amount: Math.round((li.total_money?.amount || 0) / (parseInt(li.quantity) || 1)),
          currency: "JPY",
        },
        note,
      };
    });

    const addRes = await fetch(`${SQUARE_API}/orders/${to_order_id}`, {
      method: "PUT",
      headers: hdrs(),
      body: JSON.stringify({
        order: { version: to.version, line_items: lineItems },
        idempotency_key: `merge_${to_order_id.slice(-10)}_${Date.now().toString(36)}`,
      }),
    });
    const added = await addRes.json();
    if (!addRes.ok) {
      return NextResponse.json(
        {
          error: added.errors?.[0]?.detail || `まとめるのに失敗(${addRes.status})`,
          details: added.errors,
        },
        { status: addRes.status },
      );
    }

    // 移動先に足せたので、移動元を閉じる。
    // ここで失敗すると品目が二重になるので、はっきり伝える。
    const cancelRes = await fetch(`${SQUARE_API}/orders/${from_order_id}`, {
      method: "PUT",
      headers: hdrs(),
      body: JSON.stringify({
        order: { version: from.version, state: "CANCELED" },
        idempotency_key: `mcanc_${from_order_id.slice(-10)}_${Date.now().toString(36)}`,
      }),
    });
    if (!cancelRes.ok) {
      const cd = await cancelRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            "品目は移せましたが、移動元の注文を閉じられませんでした。" +
            "そのままだと二重になるので、元のテーブルを全キャンセルしてください。" +
            (cd.errors?.[0]?.detail ? `（${cd.errors[0].detail}）` : ""),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      moved: lineItems.length,
      to: added.order?.ticket_name,
      total: added.order?.total_money?.amount ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "まとめるのに失敗" },
      { status: 500 },
    );
  }
}
