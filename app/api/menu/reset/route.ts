import { NextResponse } from "next/server";
import { saveMenuItems, DEFAULT_MENU } from "@/lib/menu";

export const runtime = "nodejs";

// POST: KVのメニューデータをDEFAULT_MENUでリセット
export async function POST() {
  try {
    await saveMenuItems(DEFAULT_MENU);
    return NextResponse.json({ ok: true, count: DEFAULT_MENU.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "リセット失敗" },
      { status: 500 },
    );
  }
}
