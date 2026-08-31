import { NextRequest, NextResponse } from "next/server";
import { getOverrides, saveOverride, classifyWith, type SalesCategory } from "@/lib/salesCategory";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/sales-category?from=&to=
//   期間中の商品を「カフェ」「物販」に分けて返す。分類を直したいとき用に一覧も返す。
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const from = sp.get("from") || today.slice(0, 8) + "01";
    const to = sp.get("to") || today;

    const res = await fetch(
      `${req.nextUrl.origin}/api/square/sales?from=${from}&to=${to}`,
      { cache: "no-store" },
    );
    const d = await res.json();
    const products: { name: string; qty: number; amount: number }[] = d?.byProduct ?? [];
    const overrides = await getOverrides();

    const rows = products
      .map((p) => ({ ...p, category: classifyWith(p.name, overrides), fixed: !!overrides[p.name.trim()] }))
      .sort((a, b) => b.amount - a.amount);

    const sum = (c: string) =>
      rows.filter((r) => r.category === c).reduce((s, r) => s + r.amount, 0);
    const cafe = sum("カフェ");
    const goods = sum("物販");

    return NextResponse.json({
      period: { from, to },
      total: cafe + goods,
      カフェ: cafe,
      物販: goods,
      goodsRate: cafe + goods > 0 ? Math.round((goods / (cafe + goods)) * 1000) / 10 : 0,
      rows,
      overrides,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/sales-category { name, category }
//   商品の分類を覚えさせる。categoryを空にすると解除。
export async function POST(req: NextRequest) {
  try {
    const { name, category } = (await req.json()) as {
      name?: string;
      category?: SalesCategory | "";
    };
    if (!name) return NextResponse.json({ error: "name が必要です" }, { status: 400 });
    await saveOverride(name, category ?? "");
    return NextResponse.json({ ok: true, overrides: await getOverrides() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
