import { NextRequest, NextResponse } from "next/server";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";

export const runtime = "nodejs";
export const maxDuration = 60;

// スタッフにLINEを送る。宛先は名前で指定する（IDは外に出さない）。
// POST { names: ["町田"], text: "...", dryRun?: true }
//   dryRun を省略すると送らずに内容だけ返す（誤送信を防ぐため）
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      names?: string[];
      text?: string;
      dryRun?: boolean;
    };
    if (!b.names?.length || !b.text) {
      return NextResponse.json({ error: "names と text が必要です" }, { status: 400 });
    }
    const dryRun = b.dryRun !== false;
    const ids = await getStaffLineIds();
    const results: { name: string; ok: boolean; error?: string }[] = [];

    for (const name of b.names) {
      const id = ids[name];
      if (!id) {
        results.push({ name, ok: false, error: "LINE未登録" });
        continue;
      }
      if (dryRun) {
        results.push({ name, ok: true });
        continue;
      }
      try {
        await pushLine(id, b.text);
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : "送信失敗" });
      }
    }
    return NextResponse.json({ dryRun, preview: b.text, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラー" },
      { status: 500 },
    );
  }
}
