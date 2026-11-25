import { NextRequest, NextResponse } from "next/server";
import { toMin } from "@/lib/instagramPlan";
import { hasContact } from "@/lib/threadsPlan";
import { disconnect, editDraft, loadWorld, makeDraft, nextDate, saveMark, saveSettings, view, type Settings } from "@/lib/threads";

export const runtime = "nodejs";
export const maxDuration = 300;

const err = (e: unknown, status: number) =>
  NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });

const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** 公開する文。電話番号・メールは保存させない */
function publicText(v: unknown, name: string, max: number, required: boolean): string {
  const s = String(v ?? "").trim().slice(0, max);
  if (required && !s) throw new Error(`${name}を入れてください`);
  if (hasContact(s)) throw new Error(`${name}に電話番号かメールアドレスが入っています`);
  return s;
}

function cleanSettings(b: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (b.on !== undefined) out.on = b.on === true;
  if (b.aiLabel !== undefined) out.aiLabel = b.aiLabel === true;
  if (b.time !== undefined) {
    const m = toMin(String(b.time));
    // cron は 7:00〜22:55 だけ動く。遅れの30分も入るように22:30まで
    if (m === null || m < 7 * 60 || m > 22 * 60 + 30) throw new Error("時刻は7:00〜22:30の間にしてください");
    out.time = String(b.time).trim().padStart(5, "0");
  }
  if (b.memo !== undefined) out.memo = publicText(b.memo, "店の紹介メモ", 2000, true);
  if (b.nightLine !== undefined) out.nightLine = publicText(b.nightLine, "夜の営業の言い方", 100, true);
  if (b.skipDates !== undefined) out.skipDates = [...new Set((b.skipDates ?? []).filter(isDate))].sort().slice(-100);
  if (b.runAlways !== undefined) {
    const on = b.runAlways.on === true;
    out.runAlways = { on, line: publicText(b.runAlways.line, "ランの公開用の一文", 300, on) };
  }
  return out;
}

export async function GET() {
  try {
    return NextResponse.json(await view());
  } catch (e) {
    return err(e, 500);
  }
}

// POST { action, ... }
//   settings { settings } / mark { id, on, title, line }
//   saveDraft { date, text } / stop { date } / resume { date } / make（次の投稿日の下書きを作る・作り直す） / disconnect
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    switch (b.action) {
      case "settings":
        await saveSettings(cleanSettings(b.settings ?? {}));
        break;
      case "mark": {
        const ev = (await loadWorld()).all.find((e) => e.id === b.id);
        if (!ev) throw new Error("予定表に見つかりません");
        const on = b.on === true;
        await saveMark(ev.id, {
          on,
          title: publicText(b.title, "公開する題", 60, on),
          line: publicText(b.line, "公開用の一文", 300, on),
          date: ev.date,
        });
        break;
      }
      case "saveDraft":
        if (!isDate(b.date)) throw new Error("日付が正しくありません");
        await editDraft(b.date, { text: String(b.text ?? "").trim() });
        break;
      case "stop":
      case "resume":
        if (!isDate(b.date)) throw new Error("日付が正しくありません");
        await editDraft(b.date, { status: b.action === "stop" ? "stopped" : "ready" });
        break;
      case "make": {
        const w = await loadWorld();
        const date = nextDate(w);
        if (!date) throw new Error("次に出す日がありません");
        await makeDraft(date, w);
        break;
      }
      case "disconnect":
        await disconnect();
        break;
      default:
        throw new Error("不明な操作です");
    }
    return NextResponse.json({ ok: true, ...(await view()) });
  } catch (e) {
    return err(e, 400);
  }
}
