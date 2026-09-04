import { NextRequest, NextResponse } from "next/server";
import { EVENTS, currentEvent, eventOf } from "@/lib/events";
import {
  addEntry,
  deadlinePassed,
  deleteEntry,
  getEntries,
  planOf,
  summary,
  updateEntry,
  type Entry,
} from "@/lib/eventEntries";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";

export const runtime = "nodejs";

// slug 省略時は「いま受け付けているイベント」。
// LINEの入口はイベントごとに変えたくないので、既定でこれを返す。
function pick(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  return slug ? eventOf(slug) : currentEvent();
}

// GET          → お客さん向け。イベントとプランだけ（個人情報は出さない）
// GET ?admin=1 → 管理用。申込の一覧と集計
export async function GET(req: NextRequest) {
  try {
    const ev = pick(req);
    if (!ev) return NextResponse.json({ event: null, plans: [], people: 0, closed: true });
    const entries = await getEntries(ev.slug);
    const base = {
      event: { slug: ev.slug, title: ev.title, dateLabel: ev.dateLabel, lead: ev.lead },
      plans: ev.plans,
      closed: deadlinePassed(ev),
      people: entries.length,
    };
    if (req.nextUrl.searchParams.get("admin") !== "1") return NextResponse.json(base);
    return NextResponse.json({
      ...base,
      events: EVENTS.map((e) => ({ slug: e.slug, title: e.title, dateLabel: e.dateLabel })),
      entries,
      summary: summary(ev, entries),
    });
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
    const b = (await req.json()) as Partial<Entry> & { slug?: string };
    const ev = b.slug ? eventOf(b.slug) : currentEvent();
    if (!ev) return NextResponse.json({ error: "イベントが見つかりません" }, { status: 400 });
    const name = (b.name || "").trim();
    if (!name) return NextResponse.json({ error: "名前を入れてください" }, { status: 400 });
    const plan = b.planId ? planOf(ev, b.planId) : undefined;
    if (!plan) return NextResponse.json({ error: "プランを選んでください" }, { status: 400 });

    const entry: Entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      lineName: (b.lineName || "").trim() || undefined,
      lineUserId: b.lineUserId || undefined,
      email: (b.email || "").trim() || undefined,
      planId: plan.id,
      paid: !!b.paid,
      djRequest: (b.djRequest || "").trim() || undefined,
      photoOk: b.photoOk !== false,
      note: (b.note || "").trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    await addEntry(ev.slug, entry);

    // 申込があったら坂本にLINEで知らせる。集客の進み具合がその場で分かる
    try {
      const s = summary(ev, await getEntries(ev.slug));
      const ids = await getStaffLineIds();
      if (ids["坂本"]) {
        await pushLine(
          ids["坂本"],
          [
            `【${ev.title}】申込がありました🎧`,
            "",
            `${entry.name}さん${entry.lineName ? `（${entry.lineName}）` : ""}`,
            `${plan.label} ¥${plan.price.toLocaleString()}`,
            ...(entry.djRequest ? [`リクエスト: ${entry.djRequest}`] : []),
            ...(entry.note ? [`メモ: ${entry.note}`] : []),
            "",
            `合計 ${s.people}人 ／ 売上見込み ¥${s.sales.toLocaleString()}`,
            `https://flat-keihi.vercel.app/event/kanri?slug=${ev.slug}`,
          ].join("\n"),
        );
      }
    } catch {
      /* 通知が失敗しても申込そのものは通す */
    }

    return NextResponse.json({ ok: true, entry, payUrl: plan.payUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// PATCH { slug, id, ...patch } → 入金済みにする・受付を通す
export async function PATCH(req: NextRequest) {
  try {
    const b = (await req.json()) as { slug?: string; id?: string } & Partial<Entry>;
    const ev = b.slug ? eventOf(b.slug) : currentEvent();
    if (!ev || !b.id) return NextResponse.json({ error: "slugとidが必要です" }, { status: 400 });
    const { slug: _s, id, ...patch } = b;
    void _s;
    const entry = await updateEntry(ev.slug, id, patch);
    if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { slug, id }
export async function DELETE(req: NextRequest) {
  try {
    const { slug, id } = (await req.json()) as { slug?: string; id?: string };
    const ev = slug ? eventOf(slug) : currentEvent();
    if (!ev || !id) return NextResponse.json({ error: "slugとidが必要です" }, { status: 400 });
    await deleteEntry(ev.slug, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
