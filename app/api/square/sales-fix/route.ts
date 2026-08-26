import { NextRequest, NextResponse } from "next/server";
import { getFixes, saveFix, type FixItem } from "@/lib/salesFix";

export const runtime = "nodejs";

// GET → いま入れてある対応表
export async function GET() {
  try {
    return NextResponse.json({ fixes: await getFixes() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST { orderId, items: [{name, qty, amount}] } → 中身を登録（itemsが空なら解除）
// 合計はSquareの金額が正なので、こちらでは変えない。金額の合計が違う場合は警告だけ返す。
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { orderId?: string; items?: FixItem[]; total?: number };
    if (!b.orderId) return NextResponse.json({ error: "orderIdが必要です" }, { status: 400 });
    const items: FixItem[] = (b.items ?? [])
      .filter((i) => i?.name && i.amount != null)
      .map((i) => ({ name: String(i.name).trim(), qty: Number(i.qty) || 1, amount: Number(i.amount) }));
    await saveFix(b.orderId, items);
    const sum = items.reduce((n, i) => n + i.amount, 0);
    return NextResponse.json({
      ok: true,
      items,
      sum,
      ...(b.total && sum !== b.total
        ? { warning: `内訳の合計 ¥${sum.toLocaleString()} が会計額 ¥${b.total.toLocaleString()} と違います` }
        : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
