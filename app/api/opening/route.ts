import { NextRequest, NextResponse } from "next/server";
import {
  TASKS,
  daysBetween,
  getDone,
  lastDoneDate,
  todayJST,
  toggle,
} from "@/lib/opening";

export const runtime = "nodejs";

// GET /api/opening?date=YYYY-MM-DD → 今日のチェック状況
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") || todayJST();
    const done = await getDone(date);

    const tasks = await Promise.all(
      TASKS.map(async (t) => {
        if (t.weekday !== undefined) {
          // 曜日が決まっている作業。その曜日以外は「今日はなし」
          const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
          return { ...t, done: done.includes(t.id), due: wd === t.weekday };
        }
        if (!t.everyDays) return { ...t, done: done.includes(t.id) };
        // 何日おきの作業は、前回からの経過で今日やるべきか判断する
        const last = await lastDoneDate(t.id);
        const since = last ? daysBetween(last, date) : null;
        return {
          ...t,
          done: done.includes(t.id),
          lastDate: last,
          daysSince: since,
          due: since === null || since >= t.everyDays,
        };
      }),
    );

    // きょう必要な作業のうち、終わった数
    const need = tasks.filter((t) => !("due" in t) || t.due);
    return NextResponse.json({
      date,
      tasks,
      total: need.length,
      doneCount: need.filter((t) => t.done).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/opening { taskId, done, date? } → チェックの付け外し
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { taskId?: string; done?: boolean; date?: string };
    if (!b.taskId) return NextResponse.json({ error: "taskIdが必要です" }, { status: 400 });
    if (!TASKS.some((t) => t.id === b.taskId)) {
      return NextResponse.json({ error: `知らない作業: ${b.taskId}` }, { status: 400 });
    }
    const date = b.date || todayJST();
    const done = await toggle(date, b.taskId, b.done !== false);
    return NextResponse.json({ ok: true, date, done });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
