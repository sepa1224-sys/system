import { NextRequest, NextResponse } from "next/server";
import { getKintai, upsertKintai, makeRecord } from "@/lib/kintai";
import { getShifts } from "@/lib/shift";

export const runtime = "nodejs";

// その日のシフトから勤怠を作る。
//
// 打刻のつけ忘れが多く、9月は1件も記録が残っていなかった。
// 「シフトには必ず来ている」ので、シフトを元にして締めのときに
// まとめてつけられるようにする。実際が違う日は勤怠の画面で直す。
//
// GET  ?date=YYYY-MM-DD → その日のシフトと、すでにある勤怠
// POST { date }         → シフトから勤怠を作る（すでにある人は触らない）
function today(): string {
  // 業務チェックと同じ営業日（朝6時切替）
  return new Date(Date.now() + (9 - 6) * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const date = req.nextUrl.searchParams.get("date") || today();
    const [shifts, kintai] = await Promise.all([getShifts(), getKintai()]);
    const s = shifts.filter((x) => x.date === date);
    const k = kintai.filter((x) => x.date === date);
    return NextResponse.json({
      date,
      shifts: s.map((x) => ({ staff: x.staff, start: x.start, end: x.end })),
      kintai: k.map((x) => ({ name: x.member || x.name, clockIn: x.clockIn, clockOut: x.clockOut })),
      done: s.length > 0 && s.every((x) => k.some((y) => (y.member || y.name) === x.staff)),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const b = (await req.json().catch(() => ({}))) as { date?: string };
    const date = b.date || today();
    const [shifts, kintai] = await Promise.all([getShifts(), getKintai()]);
    const s = shifts.filter((x) => x.date === date);
    if (!s.length) {
      return NextResponse.json({ error: `${date} のシフトがありません` }, { status: 400 });
    }
    // すでに勤怠がある人は上書きしない。手で直した内容を消さないため
    const already = new Set(
      kintai.filter((x) => x.date === date).map((x) => x.member || x.name),
    );
    const made = s
      .filter((x) => !already.has(x.staff) && x.staff !== "バイト")
      .map((x) =>
        makeRecord({
          date,
          name: x.staff,
          clockIn: x.start,
          clockOut: x.end,
          note: "シフトから作成",
          source: "manual",
        }),
      );
    if (made.length) await upsertKintai(made);
    return NextResponse.json({
      ok: true,
      created: made.length,
      skipped: [...already],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗" }, { status: 500 });
  }
}
