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

// GET: Square注文の生データを返す（テーブル番号や、消えた注文の中身を追う用）
// query: date=YYYY-MM-DD / limit=件数 / states=COMPLETED,CANCELED,OPEN,DRAFT
//
// 「金額入力」で会計された注文はSquare側に品目が残らない。
// そのとき元の注文がキャンセルされて残っていることがあるので、
// 状態を指定して探せるようにしてある。
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const date = searchParams.get("date") || "2026-08-11";
    const limit = parseInt(searchParams.get("limit") || "3");
    const states = (searchParams.get("states") || "COMPLETED")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const locationId = await getLocationId();
    const beginAt = new Date(`${date}T00:00:00+09:00`).toISOString();
    const next = new Date(`${date}T00:00:00+09:00`);
    next.setDate(next.getDate() + 1);
    const endAt = next.toISOString();

    const res = await fetch(`${SQUARE_API}/orders/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        location_ids: [locationId],
        query: {
          filter: {
            date_time_filter: {
              created_at: { start_at: beginAt, end_at: endAt },
            },
            state_filter: { states },
          },
          sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
        },
        limit,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.errors }, { status: res.status });
    }

    return NextResponse.json({
      count: (data.orders || []).length,
      orders: data.orders || [],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
