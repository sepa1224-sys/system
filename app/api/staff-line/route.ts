import { NextRequest, NextResponse } from "next/server";
import { getStaffLineIds, saveStaffLineId } from "@/lib/staffLine";
import { STAFF } from "@/lib/shift";

export const runtime = "nodejs";

// GET → 誰のLINEが登録済みか（IDそのものは返さない）
export async function GET() {
  try {
    const ids = await getStaffLineIds();
    return NextResponse.json({
      registered: Object.keys(ids),
      missing: STAFF.filter((s) => s !== "バイト" && !ids[s]),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST { name, userId } → 勤怠のLIFFページから自動で呼ばれる
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { name?: string; userId?: string };
    const name = (b.name || "").trim();
    if (!name || !b.userId) {
      return NextResponse.json({ error: "nameとuserIdが必要です" }, { status: 400 });
    }
    // スタッフ名簿にある名前だけ受け付ける（お客さんのIDを混ぜない）。
    // LINEの表示名は「坂本達郎 Tatsuro」のようにフルネームのことがあるので、
    // 名簿の名前が含まれていれば本人とみなす
    const hit = STAFF.find((st) => st !== "バイト" && name.includes(st));
    if (!hit) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    await saveStaffLineId(hit, String(b.userId));
    return NextResponse.json({ ok: true, name: hit });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
