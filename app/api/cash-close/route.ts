import { NextRequest, NextResponse } from "next/server";
import { getCloses, saveClose, deleteClose, type CashClose } from "@/lib/cashclose";

export const runtime = "nodejs";

// GET: レジ締めの履歴（新しい順）
export async function GET() {
  try {
    return NextResponse.json({ closes: await getCloses() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗", closes: [] },
      { status: 500 },
    );
  }
}

// POST: 締める。同じ営業日があれば上書き（締め直し）。
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Partial<CashClose>;
    if (!b.date) {
      return NextResponse.json({ error: "date が必要" }, { status: 400 });
    }
    if (b.counted == null) {
      return NextResponse.json({ error: "実際に数えた金額が必要" }, { status: 400 });
    }
    const floatCash = Number(b.floatCash) || 0;
    const cashSales = Number(b.cashSales) || 0;
    const cashOut = Number(b.cashOut) || 0;
    const counted = Number(b.counted) || 0;
    const expected = floatCash + cashSales - cashOut;

    const rec: CashClose = {
      date: b.date,
      floatCash,
      cashSales,
      cashOut,
      expected,
      counted,
      diff: counted - expected,
      note: b.note || "",
      closedAt: new Date().toISOString(),
      closedBy: b.closedBy || "",
    };
    await saveClose(rec);
    return NextResponse.json({ ok: true, close: rec });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { date }: 締めを取り消す
export async function DELETE(req: NextRequest) {
  try {
    const { date } = (await req.json()) as { date?: string };
    if (!date) return NextResponse.json({ error: "date が必要" }, { status: 400 });
    await deleteClose(date);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取消に失敗" },
      { status: 500 },
    );
  }
}
