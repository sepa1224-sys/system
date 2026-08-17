import { NextRequest, NextResponse } from "next/server";
import {
  getShifts,
  upsertShifts,
  deleteShifts,
  expandMonth,
  summarizeDay,
  totalsByStaff,
  entryMinutes,
  newId,
  STAFF,
  PATTERNS,
  WEEKDAY_TEMPLATES,
  type ShiftEntry,
} from "@/lib/shift";

export const runtime = "nodejs";
export const maxDuration = 60;

const todayJST = () =>
  new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// GET /api/shift?month=2026-09 → その月の割当・日別サマリ・人別合計
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get("month") || todayJST().slice(0, 7);
    const all = await getShifts();
    const entries = all.filter((e) => e.date.startsWith(month));

    // 日ごとにまとめて、穴と2人体制の長さを出す
    const byDate: Record<string, ShiftEntry[]> = {};
    for (const e of entries) (byDate[e.date] = byDate[e.date] || []).push(e);
    const days = Object.keys(byDate)
      .sort()
      .map((d) => summarizeDay(d, byDate[d]));

    const totals = totalsByStaff(entries);
    return NextResponse.json({
      month,
      staff: STAFF,
      patterns: PATTERNS,
      templates: WEEKDAY_TEMPLATES,
      entries,
      days,
      totals,
      totalMinutes: entries.reduce((n, e) => n + entryMinutes(e), 0),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/shift
//   { action: "save", entries: [...] }        個別の追加・更新
//   { action: "expand", month: "2026-09" }    曜日テンプレートを月に一括展開
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      month?: string;
      entries?: Partial<ShiftEntry>[];
    };

    if (body.action === "expand") {
      const month = body.month || todayJST().slice(0, 7);
      const all = await getShifts();
      // 既に割当のある日は上書きしない（手で直した内容を消さないため）
      const created = expandMonth(
        month,
        all.filter((e) => e.date.startsWith(month)),
      );
      if (created.length) await upsertShifts(created);
      return NextResponse.json({ ok: true, created: created.length });
    }

    const list = body.entries || [];
    if (!list.length) {
      return NextResponse.json({ error: "entriesが空です" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const entries: ShiftEntry[] = list.map((e) => ({
      id: e.id || newId(),
      date: String(e.date || ""),
      staff: String(e.staff || ""),
      start: String(e.start || ""),
      end: String(e.end || ""),
      note: e.note,
      updatedAt: now,
    }));
    for (const e of entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
        return NextResponse.json({ error: `日付が不正: ${e.date}` }, { status: 400 });
      }
      if (!entryMinutes(e)) {
        return NextResponse.json(
          { error: `時刻が不正: ${e.start}〜${e.end}` },
          { status: 400 },
        );
      }
    }
    await upsertShifts(entries);
    return NextResponse.json({ ok: true, saved: entries.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE /api/shift?ids=a,b,c
export async function DELETE(req: NextRequest) {
  try {
    const ids = (req.nextUrl.searchParams.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ error: "idsが空です" }, { status: 400 });
    }
    await deleteShifts(ids);
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
