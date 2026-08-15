import { NextRequest, NextResponse } from "next/server";
import {
  getEntries,
  addEntry,
  deleteEntry,
  counts,
  CAPS,
  ALL_PLANS,
  HANABI_PLANS,
  SHUTTLE_OPTION,
  type NatsumatsuriEntry,
} from "@/lib/natsumatsuri";

export const runtime = "nodejs";

// GET /api/natsumatsuri            → 残り枠の状況（公開）
// GET /api/natsumatsuri?list=1     → 申込一覧（管理用）
export async function GET(req: NextRequest) {
  try {
    const entries = await getEntries();
    const c = counts(entries);
    if (req.nextUrl.searchParams.get("list") === "1") {
      return NextResponse.json({ counts: c, caps: CAPS, entries });
    }
    return NextResponse.json({ counts: c, caps: CAPS });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST: 申込
export async function POST(req: NextRequest) {
  let b: Partial<NatsumatsuriEntry>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  if (!b.name?.trim()) return NextResponse.json({ error: "お名前を入力してください" }, { status: 400 });
  if (!b.lineName?.trim()) return NextResponse.json({ error: "LINEの名前を入力してください" }, { status: 400 });
  if (!b.plan || !ALL_PLANS.includes(b.plan)) return NextResponse.json({ error: "参加プランを選んでください" }, { status: 400 });
  if (!b.meetPoint) return NextResponse.json({ error: "集合場所を選んでください" }, { status: 400 });
  if (!b.transport) return NextResponse.json({ error: "移動方法を選んでください" }, { status: 400 });
  if (!b.hotsand) return NextResponse.json({ error: "ホットサンドの項目を選んでください" }, { status: 400 });
  if (!b.photoOk) return NextResponse.json({ error: "写真掲載の確認にチェックしてください" }, { status: 400 });

  try {
    // 枠チェック（保存直前にサーバー側で数える）
    const c = counts(await getEntries());
    if (HANABI_PLANS.includes(b.plan) && !c.hanabiOpen) {
      return NextResponse.json(
        { error: "ごめんなさい、花火大会が定員に達しました🙏 パーティのみのプランでのご参加をご検討ください" },
        { status: 409 },
      );
    }
    if (b.transport === SHUTTLE_OPTION && !c.shuttleOpen) {
      return NextResponse.json(
        { error: "ごめんなさい、送迎が定員（16名）に達しました🙏 お車・現地集合でのご参加をお願いします" },
        { status: 409 },
      );
    }

    const entry: NatsumatsuriEntry = {
      id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: b.name.trim(),
      lineName: b.lineName.trim(),
      plan: b.plan,
      meetPoint: b.meetPoint,
      transport: b.transport,
      hotsand: b.hotsand,
      djRequest: (b.djRequest || "").trim(),
      photoOk: true,
      note: (b.note || "").trim(),
      createdAt: new Date().toISOString(),
    };
    await addEntry(entry);
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "申込に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE { id }: 申込取消（管理用）
export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id が必要" }, { status: 400 });
    await deleteEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取消に失敗" },
      { status: 500 },
    );
  }
}
