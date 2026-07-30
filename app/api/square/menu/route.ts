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

// GET: Square上の既存カタログアイテム一覧
export async function GET() {
  try {
    const res = await fetch(`${SQUARE_API}/catalog/list?types=ITEM`, { headers: headers() });
    const data = await res.json();
    const items = (data.objects || []).map((obj: any) => ({
      id: obj.id,
      name: obj.item_data?.name,
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
