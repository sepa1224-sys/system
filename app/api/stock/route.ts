import { NextRequest, NextResponse } from "next/server";
import { getStock, updateStockCount } from "@/lib/stock";

export const runtime = "nodejs";

// GET: 在庫一覧
export async function GET() {
  try {
    const items = await getStock();
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得失敗" }, { status: 500 });
  }
}

// POST: 在庫数を更新
// body: { name, delta } (delta: +3で3個追加、-1で1個減少)
// or   { name, set } (setで絶対値指定)
export async function POST(req: NextRequest) {
  try {
    const { name, delta, set: setVal } = (await req.json()) as {
      name: string;
      delta?: number;
      set?: number;
    };
    if (!name) return NextResponse.json({ error: "name が必要" }, { status: 400 });

    if (setVal != null) {
      // 絶対値指定
      const items = await getStock();
      const idx = items.findIndex((i) => i.name === name);
      if (idx >= 0) {
        items[idx].count = Math.max(0, setVal);
        items[idx].updatedAt = new Date().toISOString();
      } else {
        items.push({ name, count: Math.max(0, setVal), updatedAt: new Date().toISOString() });
      }
      const { saveStock } = await import("@/lib/stock");
      await saveStock(items);
      return NextResponse.json({ ok: true, items });
    }

    const items = await updateStockCount(name, delta || 0);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "更新失敗" }, { status: 500 });
  }
}
