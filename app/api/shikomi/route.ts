import { NextRequest, NextResponse } from "next/server";
import {
  getRecords,
  addRecord,
  removeRecord,
  buildStates,
  todayJST,
} from "@/lib/shikomi";

export const runtime = "nodejs";

// GET /api/shikomi → 今日やること・各作業の次回予定
export async function GET() {
  try {
    const today = todayJST();
    const states = buildStates(await getRecords(), today);
    const due = states.filter(
      (s) => !s.doneToday && (s.status === "overdue" || s.status === "today" || s.status === "never"),
    );
    return NextResponse.json({
      today,
      states,
      due,
      summary: {
        due: due.length,
        dueMinutes: due.reduce((n, s) => n + (s.minutes ?? 0), 0),
        doneToday: states.filter((s) => s.doneToday).length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/shikomi { taskId, date?, note?, by? } → やったことを記録
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      taskId?: string;
      date?: string;
      note?: string;
      by?: string;
    };
    if (!b.taskId) {
      return NextResponse.json({ error: "taskId が必要です" }, { status: 400 });
    }
    await addRecord({
      taskId: b.taskId,
      date: b.date || todayJST(),
      note: b.note,
      by: b.by,
    });
    return NextResponse.json({ ok: true, states: buildStates(await getRecords()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE /api/shikomi?taskId=..&date=.. → 記録の取り消し
export async function DELETE(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const taskId = sp.get("taskId");
    const date = sp.get("date");
    if (!taskId || !date) {
      return NextResponse.json({ error: "taskId と date が必要です" }, { status: 400 });
    }
    await removeRecord(taskId, date);
    return NextResponse.json({ ok: true, states: buildStates(await getRecords()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取消に失敗" },
      { status: 500 },
    );
  }
}
