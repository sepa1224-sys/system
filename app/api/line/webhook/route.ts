import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

// LINE Messaging API Webhook。
// 友だち追加(follow)に「あいさつメッセージ」を返す。
// OA Managerのあいさつメッセージの代わりにここで管理する（コードで変更できる）。
// 必要な環境変数: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET

const GREETING = `友だち追加ありがとうございます🏮
彦根のカフェ flat. です☕

🎆 8/22（土）flat. 夏祭り2026 開催！
🌅 琵琶湖でサンセットchill
🎆 彦根城ふもとで手持ち花火
🪩 flat.で盆踊りパーティー（DJあり🎧）

申込がまだの方は、下のメニュー
「参加申込はこちら」から続きをお願いします👇
（このLINEから開くと名前の入力が省けます）

⏰ 申込期限
・花火から参加 → 8/18（火）まで
・パーティのみ → 8/20（木）まで

当日の連絡・写真データの共有はこのLINEでお送りします😉`;

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
};

async function reply(replyToken: string, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  if (!token) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // 署名検証（シークレット設定時のみ）
  const secret = process.env.LINE_CHANNEL_SECRET || "";
  if (secret) {
    const sig = req.headers.get("x-line-signature") || "";
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    if (sig !== expected) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw).events as LineEvent[]) ?? [];
  } catch {
    /* 検証ボタンの空リクエスト等 */
  }

  for (const ev of events) {
    if (ev.type === "follow" && ev.replyToken) {
      await reply(ev.replyToken, GREETING);
    }
  }

  return NextResponse.json({ ok: true });
}
