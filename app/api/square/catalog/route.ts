import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function hdrs() {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

// Squareのカタログに商品を追加する。
// 注文画面は catalog_object_id で注文を作るので、Squareに無い商品は売れない。
// POST { name, price, category?, description? }
// 既存の商品名や価格を直す。
// Squareは差分更新ができないので、今のオブジェクトを取ってきて必要な所だけ書き換えて戻す。
// PUT { id, name?, price? }
export async function PUT(req: NextRequest) {
  try {
    const b = (await req.json()) as { id?: string; name?: string; price?: number };
    if (!b.id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });

    const get = await fetch(`${SQUARE_API}/catalog/object/${b.id}`, { headers: hdrs() });
    const cur = await get.json();
    if (!get.ok) {
      return NextResponse.json(
        { error: cur.errors?.[0]?.detail || `取得に失敗(${get.status})` },
        { status: get.status },
      );
    }
    const obj = cur.object;
    if (b.name) obj.item_data.name = b.name;
    if (b.price != null) {
      const v = obj.item_data.variations?.[0];
      if (v) v.item_variation_data.price_money = { amount: b.price, currency: "JPY" };
    }

    const res = await fetch(`${SQUARE_API}/catalog/object`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({ idempotency_key: `upd_${b.id}_${Date.now()}`, object: obj }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.errors?.[0]?.detail || `更新に失敗(${res.status})`, details: data.errors },
        { status: res.status },
      );
    }
    const o = data.catalog_object;
    return NextResponse.json({
      ok: true,
      id: o?.id,
      name: o?.item_data?.name,
      price: o?.item_data?.variations?.[0]?.item_variation_data?.price_money?.amount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新に失敗" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      name?: string;
      price?: number;
      category?: string;
      description?: string;
      dryRun?: boolean;
    };
    if (!b.name || !b.price) {
      return NextResponse.json({ error: "name と price が必要です" }, { status: 400 });
    }
    if (b.dryRun !== false) {
      return NextResponse.json({ dryRun: true, willCreate: b });
    }

    const key = `item_${Date.now()}`;
    const body = {
      idempotency_key: key,
      object: {
        type: "ITEM",
        id: `#${key}`,
        item_data: {
          name: b.name,
          ...(b.description ? { description: b.description } : {}),
          variations: [
            {
              type: "ITEM_VARIATION",
              id: `#${key}_v`,
              item_variation_data: {
                name: "Regular",
                pricing_type: "FIXED_PRICING",
                price_money: { amount: b.price, currency: "JPY" },
              },
            },
          ],
        },
      },
    };

    const res = await fetch(`${SQUARE_API}/catalog/object`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.errors?.[0]?.detail || `登録に失敗(${res.status})`, details: data.errors },
        { status: res.status },
      );
    }
    const obj = data.catalog_object;
    return NextResponse.json({
      ok: true,
      id: obj?.id,
      name: obj?.item_data?.name,
      variationId: obj?.item_data?.variations?.[0]?.id,
      price: obj?.item_data?.variations?.[0]?.item_variation_data?.price_money?.amount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録に失敗" },
      { status: 500 },
    );
  }
}
