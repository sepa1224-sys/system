import { NextRequest, NextResponse } from "next/server";
import {
  daysUntil,
  getEvents,
  removeEvent,
  todayJST,
  upsertEvent,
  type EventItem,
  type Kind,
} from "@/lib/schedule";

export const runtime = "nodejs";

// GET /api/schedule → 全イベント（日付順）と、今日から見た残り日数
export async function GET() {
  try {
    const today = todayJST();
    const events = await getEvents();
    const withDays = events.map((e) => ({ ...e, daysLeft: daysUntil(e.date, today) }));
    return NextResponse.json({
      today,
      events: withDays,
      upcoming: withDays.filter((e) => daysUntil(e.endDate || e.date, today) >= 0),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/schedule { title, kind, date, endDate?, place?, note?, id? } → 追加・書き換え
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Partial<EventItem>;
    if (!b.title || !b.date) {
      return NextResponse.json({ error: "タイトルと日付が必要です" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
      return NextResponse.json({ error: "日付は YYYY-MM-DD で" }, { status: 400 });
    }
    const kind: Kind = b.kind === "出店" ? "出店" : "店舗";
    const item: EventItem = {
      id: b.id || `ev-${b.date}-${Math.random().toString(36).slice(2, 8)}`,
      title: b.title.trim(),
      kind,
      date: b.date,
      ...(b.endDate ? { endDate: b.endDate } : {}),
      ...(b.place ? { place: b.place.trim() } : {}),
      ...(b.note ? { note: b.note.trim() } : {}),
    };
    await upsertEvent(item);
    return NextResponse.json({ ok: true, event: item });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE /api/schedule?id=... → 画面から足したイベントを消す
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    const removed = await removeEvent(id);
    if (!removed) {
      return NextResponse.json(
        { error: "最初から入っているイベントは画面からは消せません" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
