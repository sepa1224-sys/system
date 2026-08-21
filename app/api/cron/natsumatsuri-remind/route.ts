import { NextRequest, NextResponse } from "next/server";
import { getEntries } from "@/lib/natsumatsuri";

export const runtime = "nodejs";
export const maxDuration = 60;

// 8/22の夏祭り当日の朝に、初めて来られる方へ最終確認を送る。
// 送るのは一度きりなので、日付が合わないときは何もしない（cronの誤爆を防ぐ）。
const SEND_DATE = "2026-08-22";
const TARGETS = ["上田果凜", "橋本和奏"];

const TEXT = `{name}さん

こんにちは、flat.です。
本日8/22（土）の夏祭り、ご参加のご予定に変更はないでしょうか。

【集合】19:40　彦根市立図書館前
そのまま歩いて金亀公園へ移動し、19:45から手持ち花火を始めます。
flat.のシャツを着たスタッフがいますので、お声がけください。

花火のあとは21:00から店でパーティです（ノンアル飲み放題 ¥2,500）。

ご都合が変わりましたら、このままご返信ください。
お会いできるのを楽しみにしています。`;

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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (today !== SEND_DATE && !force) {
    return NextResponse.json({ skipped: true, today, sendDate: SEND_DATE });
  }

  try {
    const entries = await getEntries();
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const name of TARGETS) {
      const e = entries.find((x) => x.name === name);
      if (!e?.lineUserId) {
        results.push({ name, ok: false, error: "LINEのIDが無い、または申込が取消済み" });
        continue;
      }
      try {
        await push(e.lineUserId, TEXT.replaceAll("{name}", e.name));
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
      sent: results.filter((r) => r.ok).length,
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
