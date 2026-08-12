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
      })),
    }));

    return NextResponse.json({ orders });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

// POST: 新規注文作成（OPEN状態）
// body: { table: "A1", items: [{ catalog_object_id, quantity }] }
export async function POST(req: NextRequest) {
  try {
    const { table, items } = (await req.json()) as {
      table: string;
      items: { catalog_object_id: string; quantity: number }[];
    };
    if (!table || !items?.length) {
      return NextResponse.json({ error: "table と items が必要" }, { status: 400 });
    }

    const locationId = await getLocationId();
    if (!locationId) return NextResponse.json({ error: "ロケーション未設定" }, { status: 500 });

    const lineItems = items.map((it) => ({
      catalog_object_id: it.catalog_object_id,
      quantity: String(it.quantity),
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
// body: { order_id, items: [{ catalog_object_id, quantity }], version }
export async function PUT(req: NextRequest) {
  try {
    const { order_id, items, version } = (await req.json()) as {
      order_id: string;
      items: { catalog_object_id: string; quantity: number }[];
      version: number;
    };
    if (!order_id || !items?.length) {
      return NextResponse.json({ error: "order_id と items が必要" }, { status: 400 });
    }

    const lineItems = items.map((it) => ({
      catalog_object_id: it.catalog_object_id,
      quantity: String(it.quantity),
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
