import { NextRequest, NextResponse } from "next/server";
import {
  addOrder,
  buildCandidates,
  deleteOrder,
  getOrders,
  cardOrdersForMatching,
  itemStats,
  markArrived,
  markBooked,
  matchTxn,
  todayJST,
  type OrderLine,
  type PaidBy,
} from "@/lib/purchase";
import { getItems, saveItem } from "@/lib/stockroom";

export const runtime = "nodejs";

// GET → 発注すべきもの（候補）と、発注の履歴
export async function GET(req: NextRequest) {
  try {
    // 銀行明細と突き合わせる用。金額と日付を渡すと候補の発注を返す
    const amount = req.nextUrl.searchParams.get("amount");
    const date = req.nextUrl.searchParams.get("date");
    if (amount && date) {
      return NextResponse.json({ matches: await matchTxn(Number(amount), date) });
    }
    if (req.nextUrl.searchParams.get("cardPending") === "1") {
      return NextResponse.json({ orders: await cardOrdersForMatching() });
    }

    const [built, orders, stats] = await Promise.all([
      buildCandidates(),
      getOrders(),
      itemStats(),
    ]);
    return NextResponse.json({
      ...built,
      stats,
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
    const b = (await req.json()) as {
      lines?: OrderLine[];
      note?: string;
      shop?: string;
      paidBy?: PaidBy;
      paidAmount?: number;
    };
    const lines = (b.lines ?? [])
      .filter((l) => l?.itemId && l?.name)
      .map((l) => ({ ...l, qty: Math.max(1, Number(l.qty) || 1) }));
    if (!lines.length) {
      return NextResponse.json({ error: "発注するものを選んでください" }, { status: 400 });
    }
    const order = await addOrder(lines, b.note, {
      shop: b.shop,
      paidBy: b.paidBy,
      paidAmount: b.paidAmount ? Number(b.paidAmount) : undefined,
    });

    // 実際に発注した数を、その品目の次回の既定にする。
    // 初期値は当てずっぽうなので、使いながら正しい数に寄っていくようにする。
    const items = await getItems();
    for (const l of lines) {
      const item = items.find((i) => i.id === l.itemId);
      if (!item || item.orderQty === l.qty) continue;
      await saveItem({ ...item, orderQty: l.qty });
    }

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
    const b = (await req.json()) as {
      id?: string;
      arrivedAt?: string | null;
      bookedAt?: string | null;
    };
    if (!b.id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    // 明細と突き合わせて経理が済んだ記録。届いたかどうかとは別
    if (b.bookedAt !== undefined) {
      await markBooked(b.id, b.bookedAt === null ? undefined : b.bookedAt || todayJST());
      return NextResponse.json({ ok: true });
    }
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
