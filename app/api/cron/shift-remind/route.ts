import { NextRequest, NextResponse } from "next/server";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";
import { nextWeekMonday } from "@/lib/shiftRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

// 毎週木曜の朝、シフト提出のリマインドをLINEで送る。
// 送るのは町田と櫻井だけ（坂本はシフトを組む側なので送らない）。
const TARGETS = ["町田", "櫻井"];

// 「来週」は人によって指す週がずれるので、日付を書いて送る。
// 前に週を1つ間違えて提出されたことがあるため。
function message(): string {
  const monday = nextWeekMonday();
  const s = new Date(`${monday}T00:00:00Z`);
  const e = new Date(`${monday}T00:00:00Z`);
  e.setUTCDate(e.getUTCDate() + 6);
  const f = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `【flat.】シフト提出のリマインドです📝

${f(s)}（月）〜 ${f(e)}（日）の働ける時間を、今日中に出してください。
画面の週が「${f(s)}（月）〜 ${f(e)}（日）」になっているか確かめてから出してください。

1日に何枠でも追加できます（昼も夜も入れる日は2枠）。
火曜は定休日なので入れなくて大丈夫です。

https://flat-keihi.vercel.app/shift-submit`;
}

export async function GET(req: NextRequest) {
  try {
    // Vercelのcronは指定した曜日にしか呼ばないが、手で叩いたときの誤送信を防ぐ。
    // force=1 で曜日に関係なく送れる（送り直したいときだけ使う）。
    const force = req.nextUrl.searchParams.get("force") === "1";
    const jst = new Date(Date.now() + 9 * 3600_000);
    if (!force && jst.getUTCDay() !== 4) {
      return NextResponse.json({ skipped: true, reason: "木曜ではありません" });
    }
    const text = message();
    const ids = await getStaffLineIds();
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const name of TARGETS) {
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
