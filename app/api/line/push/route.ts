import { NextRequest, NextResponse } from "next/server";
import { getEntries } from "@/lib/natsumatsuri";

export const runtime = "nodejs";
export const maxDuration = 60;

// 夏祭りの参加者にLINEを送る。
// 送れるのは LIFF 経由で申し込んで lineUserId が取れている人だけ。
// 送信内容はこちらで組み立てて、宛先は名前で指定する（IDを外に出さないため）。

async function push(userId: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定");
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE送信に失敗(${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

// GET /api/line/push → 誰に送れるかを返す（userIdは出さない）
export async function GET() {
  try {
    const entries = await getEntries();
    return NextResponse.json({
      sendable: entries
        .filter((e) => e.lineUserId)
        .map((e) => ({ name: e.name, plan: e.plan, meetPoint: e.meetPoint })),
      unsendable: entries.filter((e) => !e.lineUserId).map((e) => e.name),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/line/push { names: ["上田果凜"], text: "...", dryRun?: true }
//   text に {name} を書くと、その人の名前に置き換える。
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      names?: string[];
      text?: string;
      dryRun?: boolean;
    };
    const dryRun = b.dryRun !== false;
    if (!b.names?.length || !b.text) {
      return NextResponse.json({ error: "names と text が必要です" }, { status: 400 });
    }

    const entries = await getEntries();
    const results: { name: string; ok: boolean; preview?: string; error?: string }[] = [];

    for (const name of b.names) {
      const e = entries.find((x) => x.name === name);
      if (!e) {
        results.push({ name, ok: false, error: "申込が見つかりません" });
        continue;
      }
      if (!e.lineUserId) {
        results.push({ name, ok: false, error: "LINEのIDが未取得のため送れません" });
        continue;
      }
      const text = b.text.replaceAll("{name}", e.name);
      if (dryRun) {
        results.push({ name, ok: true, preview: text });
        continue;
      }
      try {
        await push(e.lineUserId, text);
        results.push({ name, ok: true });
      } catch (err) {
        results.push({
          name,
          ok: false,
          error: err instanceof Error ? err.message : "送信に失敗",
        });
      }
    }

    return NextResponse.json({
      dryRun,
      sent: dryRun ? 0 : results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "処理に失敗" },
      { status: 500 },
    );
  }
}
