import { NextRequest, NextResponse } from "next/server";
import { getStaffLineIds, saveStaffLineId } from "@/lib/staffLine";
import { STAFF } from "@/lib/shift";

// LINEの表示名が本名と違う人。表示名からスタッフを特定するための対応表。
// 例: 櫻井さんの表示名は "kankichi"
const DISPLAY_NAME_ALIAS: Record<string, string> = {
  kankichi: "櫻井",
};

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
    const b = (await req.json()) as { name?: string; userId?: string; forceName?: string };
    const name = (b.name || "").trim();
    if (!name || !b.userId) {
      return NextResponse.json({ error: "nameとuserIdが必要です" }, { status: 400 });
    }
    // スタッフ名簿にある名前だけ受け付ける（お客さんのIDを混ぜない）。
    // LINEの表示名は「坂本達郎 Tatsuro」のようにフルネームのことがあるので、
    // 名簿の名前が含まれていれば本人とみなす。
    // 表示名が名簿と全く違う場合は、画面から本人が名前を選んで登録する（forceName）。
    const forced = (b.forceName || "").trim();
    // 表示名の別名も見る（大文字小文字と前後の空白は無視）
    const aliasKey = Object.keys(DISPLAY_NAME_ALIAS).find((k) =>
      name.toLowerCase().includes(k.toLowerCase()),
    );
    const hit = forced
      ? STAFF.find((st) => st !== "バイト" && st === forced)
      : STAFF.find((st) => st !== "バイト" && name.includes(st)) ??
        (aliasKey ? DISPLAY_NAME_ALIAS[aliasKey] : undefined);
    if (!hit) {
      return NextResponse.json({ ok: true, skipped: true, displayName: name });
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
