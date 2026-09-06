import { NextRequest, NextResponse } from "next/server";
import {
  deleteMeeting,
  getMeetings,
  openActions,
  saveMeeting,
  type Meeting,
} from "@/lib/meetings";

export const runtime = "nodejs";

// GET → ミーティング一覧と、まだ終わっていない宿題
export async function GET() {
  try {
    const meetings = await getMeetings();
    return NextResponse.json({ meetings, open: openActions(meetings) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗", meetings: [] },
      { status: 500 },
    );
  }
}

// POST { meeting } → まるごと保存（決定事項の書き込み・宿題のチェックもここ）
export async function POST(req: NextRequest) {
  try {
    const { meeting } = (await req.json()) as { meeting?: Meeting };
    if (!meeting?.id || !meeting.date) {
      return NextResponse.json({ error: "idとdateが必要です" }, { status: 400 });
    }
    await saveMeeting(meeting);
    return NextResponse.json({ ok: true, meeting });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { id }
export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    await deleteMeeting(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
