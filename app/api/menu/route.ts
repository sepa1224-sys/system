import { NextRequest, NextResponse } from "next/server";
import { getMenuItems, upsertMenuItem, deleteMenuItem, type MenuItem } from "@/lib/menu";

export const runtime = "nodejs";

// GET: メニュー一覧
export async function GET() {
  const items = await getMenuItems();
  return NextResponse.json({ items });
}

// POST: メニュー追加・更新
export async function POST(req: NextRequest) {
  try {
    const item = (await req.json()) as MenuItem;
    if (!item.id || !item.name) {
      return NextResponse.json({ error: "idとnameは必須" }, { status: 400 });
    }
    await upsertMenuItem(item);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE: メニュー削除
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "idが必要" }, { status: 400 });
  await deleteMenuItem(id);
  return NextResponse.json({ ok: true });
}
