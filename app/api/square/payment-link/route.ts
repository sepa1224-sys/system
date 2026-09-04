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

async function locationId(): Promise<string> {
  const res = await fetch(`${SQUARE_API}/locations`, { headers: hdrs() });
  const d = await res.json();
  return d.locations?.[0]?.id || "";
}

// 事前決済のリンクを作る。
//
// ネットショップを作らずに、URLとQRだけで先にお金を受け取れる。
// イベントの前払いに使う。手数料は3.6%で、Squareの売上にそのまま入るので
// レジ締めや売上集計はいつもどおり動く。
//
// GET  → 今あるリンクの一覧
// POST { name, price, description? } → 1本作る
export async function GET() {
  try {
    const res = await fetch(`${SQUARE_API}/online-checkout/payment-links?limit=50`, {
      headers: hdrs(),
    });
    const d = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: d.errors?.[0]?.detail || `取得に失敗(${res.status})`, details: d.errors },
        { status: res.status },
      );
    }
    return NextResponse.json({
      links: (d.payment_links || []).map((l: any) => ({
        id: l.id,
        name: l.checkout_options?.name ?? "",
        url: l.url,
        createdAt: l.created_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { name?: string; price?: number; description?: string };
    if (!b.name || !b.price) {
      return NextResponse.json({ error: "nameとpriceが必要です" }, { status: 400 });
    }
    const loc = await locationId();
    const res = await fetch(`${SQUARE_API}/online-checkout/payment-links`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        idempotency_key: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        quick_pay: {
          name: b.name,
          price_money: { amount: Math.round(b.price), currency: "JPY" },
          location_id: loc,
        },
        ...(b.description
          ? { description: b.description }
          : {}),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: d.errors?.[0]?.detail || `作成に失敗(${res.status})`, details: d.errors },
        { status: res.status },
      );
    }
    const l = d.payment_link;
    return NextResponse.json({ ok: true, id: l?.id, name: b.name, price: b.price, url: l?.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
