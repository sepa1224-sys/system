import { NextRequest, NextResponse } from "next/server";
import { decrementStock } from "@/lib/stock";
import { buildTaxes, type OrderType } from "@/lib/tax";

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

// GET: 注文一覧
//   既定           … OPEN のみ（テーブルマップ用。会計済みは消える）
//   ?since_minutes=N … 直近N分に作られた OPEN + COMPLETED（KDS用）
// カウンター/テイクアウトは「作成→即会計」で1秒以内に閉じるため、
// OPENだけを見ているとKDSに一度も出ない。KDSはこのパラメータを使う。
export async function GET(req: NextRequest) {
  try {
    const sinceMinutes = parseInt(req.nextUrl.searchParams.get("since_minutes") || "0", 10);
    const locationId = await getLocationId();
    if (!locationId) return NextResponse.json({ error: "ロケーション未設定" }, { status: 500 });

    const res = await fetch(`${SQUARE_API}/orders/search`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        location_ids: [locationId],
        query: {
          filter: {
            state_filter: {
              states: sinceMinutes > 0 ? ["OPEN", "COMPLETED"] : ["OPEN"],
            },
            ...(sinceMinutes > 0
              ? {
                  date_time_filter: {
                    created_at: {
                      start_at: new Date(Date.now() - sinceMinutes * 60_000).toISOString(),
                    },
                  },
                }
              : {}),
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
      // 内税の消費税額。税率ごとの区分は taxes に入る（店内10% / 持ち帰り8%）。
      tax: o.total_tax_money?.amount ?? o.net_amounts?.tax_money?.amount ?? 0,
      taxes: (o.taxes || []).map((t: any) => ({
        name: t.name,
        percentage: t.percentage,
        type: t.type,
      })),
      items: (o.line_items || []).map((li: any) => ({
        uid: li.uid,
        name: li.name || "",
        qty: parseInt(li.quantity) || 1,
        amount: li.total_money?.amount || 0,
        catalog_object_id: li.catalog_object_id || "",
        note: li.note || "",
        tax: li.total_tax_money?.amount ?? 0,
      })),
    }));

    return NextResponse.json({ orders });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

// POST: 新規注文作成（OPEN状態）
// body: { table: "A1", orderType?: "店内"|"テイクアウト", items: [{ catalog_object_id, quantity, note?, name? }] }
// orderType と品目名から消費税（店内10% / 持ち帰り8%・酒類は10%）を内税で乗せる。
// 夜のテーブル注文は orderType 省略で店内扱い。
export async function POST(req: NextRequest) {
  try {
    const { table, items, orderType } = (await req.json()) as {
      table: string;
      orderType?: OrderType;
      items: { catalog_object_id: string; quantity: number; note?: string; name?: string }[];
    };
    if (!table || !items?.length) {
      return NextResponse.json({ error: "table と items が必要" }, { status: 400 });
    }

    const locationId = await getLocationId();
    if (!locationId) return NextResponse.json({ error: "ロケーション未設定" }, { status: 500 });

    // 品目名から税率を決める。名前が来ていない場合は店内扱い（10%）に倒す。
    const kind: OrderType =
      orderType === "テイクアウト" || table === "テイクアウト" ? "テイクアウト" : "店内";
    const { taxes, appliedTaxUids } = buildTaxes(
      items.map((it) => it.name || ""),
      kind,
    );

    const lineItems = items.map((it, i) => ({
      catalog_object_id: it.catalog_object_id,
      quantity: String(it.quantity),
      ...(it.note ? { note: it.note } : {}),
      applied_taxes: [{ tax_uid: appliedTaxUids[i] }],
    }));

    const res = await fetch(`${SQUARE_API}/orders`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        order: {
          location_id: locationId,
          ticket_name: table,
          line_items: lineItems,
          taxes,
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
// body: { order_id, version?, item_uid? | item_uids? }
// versionは省略してよい（省略時はサーバーが最新を取りに行く）。
// 画面のversionは注文を足した直後などにすぐ古くなるため。
// item_uid / item_uids がある場合はそのアイテムだけ削除、ない場合は注文全体をキャンセル
// 別会計で複数品目を切り出すときは、versionが1回しか使えないので item_uids でまとめて渡す。
export async function DELETE(req: NextRequest) {
  try {
    const { order_id, version, item_uid, item_uids, keep } = (await req.json()) as {
      order_id: string;
      version?: number;
      item_uid?: string;
      item_uids?: string[];
      /** 数量を減らして残す行。別会計で「2つのうち1つだけ」を切り出すときに使う */
      keep?: { uid: string; quantity: number }[];
    };
    if (!order_id) {
      return NextResponse.json({ error: "order_id が必要" }, { status: 400 });
    }

    let ver = version;
    if (ver == null) {
      const cur = await fetch(`${SQUARE_API}/orders/${order_id}`, { headers: hdrs() });
      const curData = await cur.json();
      if (!cur.ok) {
        return NextResponse.json(
          { error: curData.errors?.[0]?.detail || `注文が読めません(${cur.status})` },
          { status: cur.status },
        );
      }
      ver = curData.order?.version;
    }

    const uids = item_uids?.length ? item_uids : item_uid ? [item_uid] : [];
    if (uids.length > 0 || keep?.length) {
      // 指定アイテムをまとめて削除。versionは1回しか使えないので、
      // 数量を減らすだけの行（keep）も同じリクエストに載せる。
      const res = await fetch(`${SQUARE_API}/orders/${order_id}`, {
        method: "PUT",
        headers: hdrs(),
        body: JSON.stringify({
          order: {
            version: ver,
            ...(keep?.length
              ? {
                  line_items: keep.map((k) => ({
                    uid: k.uid,
                    quantity: String(k.quantity),
                  })),
                }
              : {}),
          },
          ...(uids.length ? { fields_to_clear: uids.map((u) => `line_items[${u}]`) } : {}),
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
            version: ver,
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
