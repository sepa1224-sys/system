import { NextRequest, NextResponse } from "next/server";
import {
  PLANS,
  addEntry,
  deadlinePassed,
  deleteEntry,
  getEntries,
  planOf,
  summary,
  updateEntry,
  type Entry,
} from "@/lib/djnight";

export const runtime = "nodejs";

// GET            → お客さん向け。プランと締切だけ返す（個人情報は出さない）
// GET ?admin=1   → 管理用。申込の一覧と集計
export async function GET(req: NextRequest) {
  try {
    const admin = req.nextUrl.searchParams.get("admin") === "1";
    const entries = await getEntries();
    if (!admin) {
      return NextResponse.json({
        plans: PLANS,
        closed: deadlinePassed(),
        people: entries.length,
      });
    }
    return NextResponse.json({ plans: PLANS, entries, summary: summary(entries) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST → 申込
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Partial<Entry>;
    const name = (b.name || "").trim();
    if (!name) return NextResponse.json({ error: "名前を入れてください" }, { status: 400 });
    if (!b.planId || !planOf(b.planId)) {
      return NextResponse.json({ error: "プランを選んでください" }, { status: 400 });
    }
    const entry: Entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      lineName: (b.lineName || "").trim() || undefined,
      lineUserId: b.lineUserId,
      email: (b.email || "").trim() || undefined,
      planId: b.planId,
      paid: !!b.paid,
      djRequest: (b.djRequest || "").trim() || undefined,
      photoOk: b.photoOk !== false,
      note: (b.note || "").trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    await addEntry(entry);
    return NextResponse.json({ ok: true, entry, payUrl: planOf(entry.planId)?.payUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// PATCH { id, ...patch } → 支払い済みにする・受付を通す・内容を直す
export async function PATCH(req: NextRequest) {
  try {
    const b = (await req.json()) as { id?: string } & Partial<Entry>;
    if (!b.id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    const { id, ...patch } = b;
    const entry = await updateEntry(id, patch);
    if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { id }
export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    await deleteEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
