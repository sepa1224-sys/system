import { NextRequest, NextResponse } from "next/server";
import { decrementStock } from "@/lib/stock";

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

// GET: OPEN状態の注文一覧（テーブルマップ・KDS用）
export async function GET() {
  try {
    const locationId = await getLocationId();
    if (!locationId) return NextResponse.json({ error: "ロケーション未設定" }, { status: 500 });

    const res = await fetch(`${SQUARE_API}/orders/search`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        location_ids: [locationId],
        query: {
          filter: {
            state_filter: { states: ["OPEN"] },
          },
          sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.errors?.[0]?.detail || "取得エラー" }, { status: res.status });
    }

    const orders = (data.orders || []).map((o: any) => ({
      id: o.id,
      ticket_name: o.ticket_name || "",
      state: o.state,
      created_at: o.created_at,
      version: o.version,
      total: o.total_money?.amount || 0,
      items: (o.line_items || []).map((li: any) => ({
        uid: li.uid,
        name: li.name || "",
        qty: parseInt(li.quantity) || 1,
        amount: li.total_money?.amount || 0,
        catalog_object_id: li.catalog_object_id || "",
        note: li.note || "",
      })),
    }));

    return NextResponse.json({ orders });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

// POST: 新規注文作成（OPEN状態）
// body: { table: "A1", items: [{ catalog_object_id, quantity, note? }] }
export async function POST(req: NextRequest) {
  try {
    const { table, items } = (await req.json()) as {
      table: string;
      items: { catalog_object_id: string; quantity: number; note?: string }[];
    };
    if (!table || !items?.length) {
      return NextResponse.json({ error: "table と items が必要" }, { status: 400 });
    }

    const locationId = await getLocationId();
    if (!locationId) return NextResponse.json({ error: "ロケーション未設定" }, { status: 500 });

    const lineItems = items.map((it) => ({
      catalog_object_id: it.catalog_object_id,
      quantity: String(it.quantity),
      ...(it.note ? { note: it.note } : {}),
    }));

    const res = await fetch(`${SQUARE_API}/orders`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        order: {
          location_id: locationId,
          ticket_name: table,
          line_items: lineItems,
          state: "OPEN",
        },
        idempotency_key: `order_${table}_${Date.now()}`,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({
        error: data.errors?.[0]?.detail || `注文作成エラー ${res.status}`,
        details: data.errors,
      }, { status: res.status });
    }

    // 在庫管理対象の商品を自動で減らす
    for (const li of data.order?.line_items || []) {
      const name = li.name || "";
      const qty = parseInt(li.quantity) || 1;
      if (name) await decrementStock(name, qty).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: data.order?.id,
        ticket_name: data.order?.ticket_name,
        total: data.order?.total_money?.amount || 0,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "注文作成失敗" }, { status: 500 });
  }
}

// PUT: 既存注文に追加
// body: { order_id, items: [{ catalog_object_id, quantity, note? }], version }
export async function PUT(req: NextRequest) {
  try {
    const { order_id, items, version } = (await req.json()) as {
      order_id: string;
      items: { catalog_object_id: string; quantity: number; note?: string }[];
      version: number;
    };
    if (!order_id || !items?.length) {
      return NextResponse.json({ error: "order_id と items が必要" }, { status: 400 });
    }

    const lineItems = items.map((it) => ({
      catalog_object_id: it.catalog_object_id,
      quantity: String(it.quantity),
      ...(it.note ? { note: it.note } : {}),
    }));

    const res = await fetch(`${SQUARE_API}/orders/${order_id}`, {
      method: "PUT",
      headers: hdrs(),
      body: JSON.stringify({
        order: {
          version,
          line_items: lineItems,
        },
        idempotency_key: `add_${order_id}_${Date.now()}`,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({
        error: data.errors?.[0]?.detail || `追加エラー ${res.status}`,
        details: data.errors,
      }, { status: res.status });
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: data.order?.id,
        ticket_name: data.order?.ticket_name,
        total: data.order?.total_money?.amount || 0,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "追加失敗" }, { status: 500 });
  }
}

// DELETE: 注文からアイテムを削除、または注文全体を削除
// body: { order_id, version, item_uid? }
// item_uid がある場合はそのアイテムだけ削除、ない場合は注文全体をキャンセル
export async function DELETE(req: NextRequest) {
  try {
    const { order_id, version, item_uid } = (await req.json()) as {
      order_id: string;
      version: number;
      item_uid?: string;
    };
    if (!order_id) {
      return NextResponse.json({ error: "order_id が必要" }, { status: 400 });
    }

    if (item_uid) {
      // 特定アイテムを削除
      const res = await fetch(`${SQUARE_API}/orders/${order_id}`, {
        method: "PUT",
        headers: hdrs(),
        body: JSON.stringify({
          order: {
            version,
          },
          fields_to_clear: [`line_items[${item_uid}]`],
          idempotency_key: `del_${order_id.slice(-10)}_${Date.now().toString(36)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({
          error: data.errors?.[0]?.detail || `削除エラー ${res.status}`,
          details: data.errors,
        }, { status: res.status });
      }

      // アイテムが0になったら注文自体をキャンセル
      const remaining = data.order?.line_items?.length || 0;
      if (remaining === 0) {
        // OPEN注文をCANCELEDに
        await fetch(`${SQUARE_API}/orders/${order_id}`, {
          method: "PUT",
          headers: hdrs(),
          body: JSON.stringify({
            order: {
              version: data.order?.version,
              state: "CANCELED",
            },
            idempotency_key: `canc_${order_id.slice(-10)}_${Date.now().toString(36)}`,
          }),
        });
      }

      return NextResponse.json({ ok: true, remaining });
    } else {
      // 注文全体をキャンセル
      const res = await fetch(`${SQUARE_API}/orders/${order_id}`, {
        method: "PUT",
        headers: hdrs(),
        body: JSON.stringify({
          order: {
            version,
            state: "CANCELED",
          },
          idempotency_key: `canc_${order_id.slice(-10)}_${Date.now().toString(36)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({
          error: data.errors?.[0]?.detail || `キャンセルエラー ${res.status}`,
          details: data.errors,
        }, { status: res.status });
      }

      return NextResponse.json({ ok: true, canceled: true });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "削除失敗" }, { status: 500 });
  }
}
