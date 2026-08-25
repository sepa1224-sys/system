import { NextResponse } from "next/server";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";

export const runtime = "nodejs";
export const maxDuration = 60;

// 毎週水曜の朝、シフト提出のリマインドをLINEで送る。
// 送るのは町田と櫻井だけ（坂本はシフトを組む側なので送らない）。
const TARGETS = ["町田", "櫻井"];

const MESSAGE = `【flat.】シフト提出のリマインドです📝

来週の働ける時間を今日中に出してください。
1日に何枠でも追加できます（昼も夜も入れる日は2枠）。

https://flat-keihi.vercel.app/shift-submit`;

export async function GET() {
  try {
    // Vercelのcronは指定した曜日にしか呼ばないが、手で叩いたときの誤送信を防ぐ
    const jst = new Date(Date.now() + 9 * 3600_000);
    if (jst.getUTCDay() !== 3) {
      return NextResponse.json({ skipped: true, reason: "水曜ではありません" });
    }
    const ids = await getStaffLineIds();
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const name of TARGETS) {
      const id = ids[name];
      if (!id) {
        results.push({ name, ok: false, error: "LINE未登録（勤怠のLINE打刻を一度開くと登録されます）" });
        continue;
      }
      try {
        await pushLine(id, MESSAGE);
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : "送信失敗" });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラー" },
      { status: 500 },
    );
  }
}
