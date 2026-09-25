import { NextRequest, NextResponse } from "next/server";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";
import {
  getWeek,
  nextWeekMonday,
  remindMessage,
  REMIND_TARGETS,
} from "@/lib/shiftRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

// シフト提出の催促を、人を選んで送る。
//
// 毎週木曜のリマインドは cron が全員に送る（/api/cron/shift-remind）。
// こちらは「1人だけまだ出していない」ときに、その人にだけ送るためのもの。
// 文面は cron と同じものを使う。

// GET → 来週ぶんの提出状況。誰に送れるかも返す
export async function GET() {
  const week = nextWeekMonday();
  const [subs, ids] = await Promise.all([getWeek(week), getStaffLineIds()]);
  return NextResponse.json({
    week,
    staff: REMIND_TARGETS.map((name) => ({
      name,
      submitted: !!subs[name],
      // LINEのIDは勤怠のLINE打刻を一度開くと覚える
      sendable: !!ids[name],
    })),
    preview: remindMessage(),
  });
}

// POST { names: ["町田"] } → その人たちに送る
export async function POST(req: NextRequest) {
  try {
    const { names } = (await req.json()) as { names?: string[] };
    if (!names?.length) {
      return NextResponse.json({ error: "送る相手を選んでください" }, { status: 400 });
    }
    const ids = await getStaffLineIds();
    const text = remindMessage();
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const name of names) {
      const id = ids[name];
      if (!id) {
        results.push({
          name,
          ok: false,
          error: "LINE未登録（勤怠のLINE打刻を一度開くと登録されます）",
        });
        continue;
      }
      try {
        await pushLine(id, text);
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : "送信失敗" });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "送信に失敗" },
      { status: 500 },
    );
  }
}
