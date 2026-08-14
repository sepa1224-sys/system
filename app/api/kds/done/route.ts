import { NextRequest, NextResponse } from "next/server";
import { getDoneKeys, addDoneKeys, removeDoneKeys } from "@/lib/kds";

export const runtime = "nodejs";

// GET: 作り終えた品目のキー一覧
export async function GET() {
  try {
    return NextResponse.json({ keys: await getDoneKeys() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗", keys: [] },
      { status: 500 },
    );
  }
}

// POST { keys: string[] } : 完了にする
export async function POST(req: NextRequest) {
  try {
    const { keys } = (await req.json()) as { keys?: string[] };
    if (!keys?.length) {
      return NextResponse.json({ error: "keys が必要" }, { status: 400 });
    }
    await addDoneKeys(keys);
    return NextResponse.json({ ok: true, keys: await getDoneKeys() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { keys: string[] } : 完了を取り消して作業中に戻す
export async function DELETE(req: NextRequest) {
  try {
    const { keys } = (await req.json()) as { keys?: string[] };
    if (!keys?.length) {
      return NextResponse.json({ error: "keys が必要" }, { status: 400 });
    }
    await removeDoneKeys(keys);
    return NextResponse.json({ ok: true, keys: await getDoneKeys() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取消に失敗" },
      { status: 500 },
    );
  }
}
