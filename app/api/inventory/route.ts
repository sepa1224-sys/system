import { NextRequest, NextResponse } from "next/server";
import { getInventoryItems, upsertInventoryItem, deleteInventoryItem, type InventoryItem } from "@/lib/inventory";

export const runtime = "nodejs";

// GET: 仕入れ表一覧
export async function GET() {
  const items = await getInventoryItems();
  return NextResponse.json({ items });
}

// POST: 仕入れアイテム追加・更新
export async function POST(req: NextRequest) {
  try {
    const item = (await req.json()) as InventoryItem;
    if (!item.id || !item.name) {
      return NextResponse.json({ error: "idとnameは必須" }, { status: 400 });
    }
    await upsertInventoryItem(item);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE: 仕入れアイテム削除
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "idが必要" }, { status: 400 });
  await deleteInventoryItem(id);
  return NextResponse.json({ ok: true });
}
