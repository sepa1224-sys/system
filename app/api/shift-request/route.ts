import { NextRequest, NextResponse } from "next/server";
import {
  getWeek,
  nextWeekMonday,
  submit,
  withdraw,
  type Slot,
  type Submission,
} from "@/lib/shiftRequest";
import { STAFF } from "@/lib/shift";

export const runtime = "nodejs";

// GET /api/shift-request?week=YYYY-MM-DD（省略時は来週） → 全員の提出状況
export async function GET(req: NextRequest) {
  try {
    const week = req.nextUrl.searchParams.get("week") || nextWeekMonday();
    const subs = await getWeek(week);
    return NextResponse.json({
      week,
      staff: STAFF.filter((s) => s !== "バイト"),
      submissions: subs,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/shift-request { staff, week, slots: [{weekday,start,end}] }
// 同じ人が出し直したら上書き。空のslotsは「その週は入れない」の提出として扱う。
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Partial<Submission>;
    if (!b.staff) return NextResponse.json({ error: "staffが必要です" }, { status: 400 });
    const week = b.week || nextWeekMonday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
      return NextResponse.json({ error: "weekは YYYY-MM-DD で" }, { status: 400 });
    }
    const slots: Slot[] = [];
    for (const s of b.slots ?? []) {
      if (s.weekday == null || !s.start || !s.end) continue;
      slots.push({ weekday: Number(s.weekday), start: String(s.start), end: String(s.end) });
    }
    const sub: Submission = {
      staff: String(b.staff),
      week,
      slots,
      submittedAt: new Date().toISOString(),
    };
    await submit(sub);
    return NextResponse.json({ ok: true, submission: sub });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE /api/shift-request { week, staff } → 提出を取り消す
export async function DELETE(req: NextRequest) {
  try {
    const { week, staff } = (await req.json()) as { week?: string; staff?: string };
    if (!week || !staff) {
      return NextResponse.json({ error: "weekとstaffが必要です" }, { status: 400 });
    }
    await withdraw(week, staff);
    return NextResponse.json({ ok: true, submissions: await getWeek(week) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取消に失敗" },
      { status: 500 },
    );
  }
}
