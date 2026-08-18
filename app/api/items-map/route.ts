import { NextRequest, NextResponse } from "next/server";
import { getReceipts, receiptLines } from "@/lib/receipts";
import {
  ITEM_RULES,
  getOverrides,
  saveOverride,
  resolveWithOverrides,
} from "@/lib/freeeItems";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/items-map
//   いま使える品目、覚えさせた対応、まだ分類できていない品名を返す。
export async function GET() {
  try {
    const [overrides, receipts] = await Promise.all([getOverrides(), getReceipts()]);

    // 選択肢に出す品目名（ルール表＋覚えさせた分）
    const items = [
      ...new Set([...ITEM_RULES.map((r) => r.item), ...Object.values(overrides)]),
    ].sort();

    // まだ品目が付かない品名を、金額の大きい順に出す
    const unresolved = new Map<string, number>();
    for (const r of receipts) {
      for (const l of receiptLines(r)) {
        const name = (l.name || "").trim();
        if (!name) continue;
        if (resolveWithOverrides(name, overrides)) continue;
        unresolved.set(name, (unresolved.get(name) ?? 0) + (l.amount || 0));
      }
    }
    return NextResponse.json({
      items,
      overrides,
      unresolved: [...unresolved.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/items-map { keyword, item }
//   品名の一部（キーワード）と品目を結びつけて覚える。itemを空にすると解除。
export async function POST(req: NextRequest) {
  try {
    const { keyword, item } = (await req.json()) as { keyword?: string; item?: string };
    if (!keyword) {
      return NextResponse.json({ error: "keyword が必要です" }, { status: 400 });
    }
    await saveOverride(keyword, item ?? "");
    return NextResponse.json({ ok: true, overrides: await getOverrides() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
