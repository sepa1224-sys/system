import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  getKintai,
  upsertKintai,
  deleteKintai,
  makeRecord,
  recordHours,
  type KintaiRecord,
} from "@/lib/kintai";
import { mapName, HOURLY_RATE } from "@/lib/labor";

export const runtime = "nodejs";
export const maxDuration = 60;

const nowJST = () => new Date(Date.now() + 9 * 3600_000);
const todayJST = () => nowJST().toISOString().slice(0, 10);
const timeJST = () => {
  const d = nowJST();
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

// GET /api/kintai?month=2026-08&name=坂本 → 記録一覧＋月次集計
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const month = searchParams.get("month") || todayJST().slice(0, 7);
    const name = searchParams.get("name") || "";
    const all = await getKintai();
    const member = name ? mapName(name) : null;

    const records = all.filter(
      (r) =>
        r.date.startsWith(month) &&
        (!name || r.member === (member ?? name) || r.name === name),
    );

    // 月次集計（メンバー別）
    const summary: Record<string, { hours: number; days: number }> = {};
    for (const r of all.filter((x) => x.date.startsWith(month))) {
      const m = r.member;
      if (!m) continue;
      const h = recordHours(r);
      if (h === null) continue;
      summary[m] = summary[m] || { hours: 0, days: 0 };
      summary[m].hours = Math.round((summary[m].hours + h) * 10) / 10;
      summary[m].days += 1;
    }

    // 未退勤（打刻し忘れ検知用）
    const open = all.filter((r) => r.clockOut === "");

    return NextResponse.json({ month, records, summary, open, rate: HOURLY_RATE });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// AIが返す整形結果のスキーマ
const ParsedSchema = z.object({
  entries: z
    .array(
      z.object({
        date: z.string().describe("出勤日 YYYY-MM-DD。相対表現（昨日・先週の土曜など）は今日の日付から解決する。"),
        clockIn: z.string().describe('出勤時刻 "H:MM" 24時間表記（例 14:00）。'),
        clockOut: z
          .string()
          .describe('退勤時刻 "H:MM"。25時など24時超は翌日時刻に直す（25:00→1:00）。まだ退勤していない・不明なら空文字。'),
        breakMin: z.number().describe("休憩時間（分）。「休憩1時間」→60。記載がなければ0。"),
        note: z.string().describe("成果物・作業内容などのメモ。なければ空文字。"),
      }),
    )
    .describe("勤怠記録の配列。「月〜金毎日」のような範囲表現は1日1件に展開する。"),
  reply: z.string().describe("入力者に見せる短い確認メッセージ（日本語）。例:「8/10 14:00〜1:00（休憩60分・実働10時間）で登録します」"),
});

// POST /api/kintai
//  { action:"clockin", name, note? }          … いま出勤
//  { action:"clockout", name, breakMin? }     … いま退勤（直近の未退勤レコードを閉じる）
//  { action:"add", records:[...] }            … 整形済みレコードの一括登録（インポート・確認後の保存）
//  { action:"parse", name, text }             … 自由入力をClaudeで構造化（保存はしない）
export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    name?: string;
    text?: string;
    note?: string;
    breakMin?: number;
    records?: Partial<KintaiRecord>[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  try {
    if (body.action === "clockin") {
      if (!body.name) return NextResponse.json({ error: "name が必要" }, { status: 400 });
      const rec = makeRecord({
        date: todayJST(),
        name: body.name,
        clockIn: timeJST(),
        note: body.note,
        source: "liff",
      });
      await upsertKintai([rec]);
      return NextResponse.json({ ok: true, record: rec });
    }

    if (body.action === "clockout") {
      if (!body.name) return NextResponse.json({ error: "name が必要" }, { status: 400 });
      const member = mapName(body.name);
      const all = await getKintai();
      // 直近2日以内の未退勤レコード（日跨ぎシフト対応）
      const yesterday = new Date(nowJST().getTime() - 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const open = all
        .filter(
          (r) =>
            r.clockOut === "" &&
            (r.member === member || r.name === body.name) &&
            r.date >= yesterday,
        )
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (!open) {
        return NextResponse.json(
          { error: "出勤記録が見つかりません。先に出勤するか、まとめて入力を使ってください。" },
          { status: 404 },
        );
      }
      open.clockOut = timeJST();
      if (body.breakMin != null) open.breakMin = Number(body.breakMin) || 0;
      if (body.note) open.note = body.note;
      open.updatedAt = new Date().toISOString();
      await upsertKintai([open]);
      return NextResponse.json({ ok: true, record: open, hours: recordHours(open) });
    }

    if (body.action === "add") {
      const list = (body.records || [])
        .filter((r) => r.date && r.clockIn && r.name)
        .map((r) =>
          makeRecord({
            date: r.date!,
            name: r.name!,
            clockIn: r.clockIn!,
            clockOut: r.clockOut,
            breakMin: r.breakMin,
            note: r.note,
            source: r.source || "manual",
            id: r.id,
          }),
        );
      if (list.length === 0) {
        return NextResponse.json({ error: "登録できる記録がありません" }, { status: 400 });
      }
      await upsertKintai(list);
      return NextResponse.json({ ok: true, count: list.length, records: list });
    }

    if (body.action === "parse") {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
      }
      if (!body.text || !body.name) {
        return NextResponse.json({ error: "name と text が必要" }, { status: 400 });
      }
      const client = new Anthropic();
      const res = await client.beta.messages.parse({
        model: "claude-opus-5",
        max_tokens: 2048,
        output_format: betaZodOutputFormat(ParsedSchema),
        messages: [
          {
            role: "user",
            content:
              `カフェの勤怠入力を構造化してください。\n` +
              `今日: ${todayJST()}（日本時間）\n` +
              `入力者: ${body.name}\n` +
              `シフトの前提: 夜は25時（=翌1:00）まで営業することがある。「25時」「26時」は翌日の1:00・2:00に直す。\n` +
              `入力: 「${body.text}」`,
          },
        ],
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) {
        return NextResponse.json({ error: "読み取れませんでした。書き方を変えてみてください。" }, { status: 422 });
      }
      const entries = res.parsed_output.entries.map((e) => ({
        ...e,
        name: body.name!,
        member: mapName(body.name!),
        source: "ai",
      }));
      return NextResponse.json({ ok: true, entries, reply: res.parsed_output.reply });
    }

    return NextResponse.json({ error: "不明なaction" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "処理に失敗" },
      { status: 500 },
    );
  }
}

// PATCH { id, patch } : 1件修正
export async function PATCH(req: NextRequest) {
  try {
    const { id, patch } = (await req.json()) as {
      id?: string;
      patch?: Partial<KintaiRecord>;
    };
    if (!id || !patch) return NextResponse.json({ error: "id と patch が必要" }, { status: 400 });
    const all = await getKintai();
    const rec = all.find((r) => r.id === id);
    if (!rec) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    const updated: KintaiRecord = {
      ...rec,
      ...patch,
      id: rec.id,
      member: patch.name ? mapName(patch.name) : rec.member,
      updatedAt: new Date().toISOString(),
    };
    await upsertKintai([updated]);
    return NextResponse.json({ ok: true, record: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "修正に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { ids: [...] }
export async function DELETE(req: NextRequest) {
  try {
    const { ids } = (await req.json()) as { ids?: string[] };
    if (!ids?.length) return NextResponse.json({ error: "ids が必要" }, { status: 400 });
    await deleteKintai(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
