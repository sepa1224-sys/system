import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function headers() {
  const token = process.env.SQUARE_ACCESS_TOKEN || "";
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function getLocationId(): Promise<string> {
  const res = await fetch(`${SQUARE_API}/locations`, { headers: headers() });
  const data = await res.json();
  return data.locations?.[0]?.id || "";
}

// GET: Square上の既存カタログアイテム一覧（カテゴリ付き）
export async function GET() {
  try {
    // カテゴリ一覧を取得
    const catRes = await fetch(`${SQUARE_API}/catalog/list?types=CATEGORY`, { headers: headers() });
    const catData = await catRes.json();
    const catMap: Record<string, string> = {};
    for (const obj of catData.objects || []) {
      catMap[obj.id] = obj.category_data?.name || "";
    }

    // アイテム一覧を取得（ページネーション対応）
    const allObjects: any[] = [];
    let cursor: string | undefined;
    do {
      const url = `${SQUARE_API}/catalog/list?types=ITEM${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await fetch(url, { headers: headers() });
      const data = await res.json();
      allObjects.push(...(data.objects || []));
      cursor = data.cursor;
    } while (cursor);

    const items = allObjects.map((obj: any) => ({
      id: obj.id,
      name: obj.item_data?.name,
      category: catMap[obj.item_data?.category_id] || "",
      variations: (obj.item_data?.variations || []).map((v: any) => ({
        id: v.id,
        name: v.item_variation_data?.name,
        price: v.item_variation_data?.price_money?.amount, // cents
      })),
    }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

// POST: メニューアイテムを一括登録
// body: { items: [{ name, price }] }  price は円（税込）
export async function POST(req: NextRequest) {
  try {
    const { items } = (await req.json()) as { items: { name: string; price: number; description?: string }[] };
    if (!items?.length) return NextResponse.json({ error: "itemsが必要" }, { status: 400 });

    const locationId = await getLocationId();
    if (!locationId) return NextResponse.json({ error: "ロケーションが見つかりません" }, { status: 500 });

    // バッチでカタログに登録
    const batches = items.map((item, i) => ({
      type: "ITEM",
      id: `#item_${i}`,
      present_at_location_ids: [locationId],
      item_data: {
        name: item.name,
        description: item.description || "",
        variations: [
          {
            type: "ITEM_VARIATION",
            id: `#var_${i}`,
            item_variation_data: {
              name: "Regular",
              pricing_type: "FIXED_PRICING",
              price_money: {
                amount: item.price, // Squareは日本円ならcents不要（amount=円）
                currency: "JPY",
              },
            },
          },
        ],
      },
    }));

    const res = await fetch(`${SQUARE_API}/catalog/batch-upsert`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        idempotency_key: `menu_${Date.now()}`,
        batches: [{ objects: batches }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({
        error: data.errors?.[0]?.detail || `Square API error ${res.status}`,
        details: data.errors,
      }, { status: res.status });
    }

    const created = (data.objects || []).map((obj: any) => ({
      id: obj.id,
      name: obj.item_data?.name,
    }));

    return NextResponse.json({ ok: true, created });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "登録失敗" }, { status: 500 });
  }
}

// PATCH: 既存アイテムの価格を更新
// body: { variation_id, price }  price は円（税込）
export async function PATCH(req: NextRequest) {
  try {
    const { variation_id, price } = (await req.json()) as { variation_id: string; price: number };
    if (!variation_id || price == null) {
      return NextResponse.json({ error: "variation_id と price が必要" }, { status: 400 });
    }

    // まず現在のオブジェクトを取得（versionが必要）
    const getRes = await fetch(`${SQUARE_API}/catalog/object/${variation_id}`, { headers: headers() });
    const getData = await getRes.json();
    if (!getRes.ok) {
      return NextResponse.json({
        error: getData.errors?.[0]?.detail || `取得エラー ${getRes.status}`,
      }, { status: getRes.status });
    }

    const obj = getData.object;
    // price_moneyを更新
    obj.item_variation_data.price_money = { amount: price, currency: "JPY" };

    const upsertRes = await fetch(`${SQUARE_API}/catalog/object`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        idempotency_key: `update_${variation_id}_${Date.now()}`,
        object: obj,
      }),
    });

    const upsertData = await upsertRes.json();
    if (!upsertRes.ok) {
      return NextResponse.json({
        error: upsertData.errors?.[0]?.detail || `更新エラー ${upsertRes.status}`,
        details: upsertData.errors,
      }, { status: upsertRes.status });
    }

    return NextResponse.json({
      ok: true,
      updated: {
        id: upsertData.catalog_object?.id,
        name: upsertData.catalog_object?.item_variation_data?.name,
        price,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "更新失敗" }, { status: 500 });
  }
}
