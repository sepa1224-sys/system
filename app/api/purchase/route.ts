import { NextRequest, NextResponse } from "next/server";
import {
  addOrder,
  buildCandidates,
  deleteOrder,
  getOrders,
  markArrived,
  todayJST,
  type OrderLine,
} from "@/lib/purchase";

export const runtime = "nodejs";

// GET → 発注すべきもの（候補）と、発注の履歴
export async function GET() {
  try {
    const [built, orders] = await Promise.all([buildCandidates(), getOrders()]);
    return NextResponse.json({
      ...built,
      today: todayJST(),
      open: orders.filter((o) => !o.arrivedAt),
      history: orders.filter((o) => o.arrivedAt).slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST { lines, note? } → 発注したことを記録する
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { lines?: OrderLine[]; note?: string };
    const lines = (b.lines ?? [])
      .filter((l) => l?.itemId && l?.name)
      .map((l) => ({ ...l, qty: Math.max(1, Number(l.qty) || 1) }));
    if (!lines.length) {
      return NextResponse.json({ error: "発注するものを選んでください" }, { status: 400 });
    }
    const order = await addOrder(lines, b.note);
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// PATCH { id, arrivedAt? } → 届いた日を記録。arrivedAt を空にすると未着に戻す
export async function PATCH(req: NextRequest) {
  try {
    const b = (await req.json()) as { id?: string; arrivedAt?: string | null };
    if (!b.id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    const order = await markArrived(b.id, b.arrivedAt === null ? undefined : b.arrivedAt || todayJST());
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { id } → 発注そのものを取り消す（間違えて記録したとき）
export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    await deleteOrder(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
