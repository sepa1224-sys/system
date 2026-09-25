import { NextRequest, NextResponse } from "next/server";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";
import { remindMessage, REMIND_TARGETS } from "@/lib/shiftRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

// 毎週木曜の朝、シフト提出のリマインドをLINEで送る。
// 坂本もシフトに入るので、組む側だが同じように出してもらう。


export async function GET(req: NextRequest) {
  try {
    // Vercelのcronは指定した曜日にしか呼ばないが、手で叩いたときの誤送信を防ぐ。
    // force=1 で曜日に関係なく送れる（送り直したいときだけ使う）。
    const force = req.nextUrl.searchParams.get("force") === "1";
    const jst = new Date(Date.now() + 9 * 3600_000);
    if (!force && jst.getUTCDay() !== 4) {
      return NextResponse.json({ skipped: true, reason: "木曜ではありません" });
    }
    const text = remindMessage();
    const ids = await getStaffLineIds();
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const name of REMIND_TARGETS) {
      const id = ids[name];
      if (!id) {
        results.push({ name, ok: false, error: "LINE未登録（勤怠のLINE打刻を一度開くと登録されます）" });
        continue;
      }
      try {
        await pushLine(id, text);
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
