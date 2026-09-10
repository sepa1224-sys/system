import { NextRequest, NextResponse } from "next/server";
import { eventCarousel, upcomingEvents } from "@/lib/lineEvents";

export const runtime = "nodejs";

// 「イベント申込一覧」のカルーセル。
// 普段はリッチメニュー → Webhook から返るので、ここは中身の確認と試し送り用。

// GET → いま出るカルーセルの中身。?raw=1 でFlexのJSONそのまま
export async function GET(req: NextRequest) {
  const msg = eventCarousel();
  if (req.nextUrl.searchParams.get("raw") === "1") {
    return NextResponse.json(msg);
  }
  return NextResponse.json({
    events: upcomingEvents().map((e) => ({
      slug: e.slug,
      title: e.title,
      dateLabel: e.dateLabel,
      prices: e.plans.map((p) => p.price),
      ogImage: e.ogImage ?? null,
    })),
    altText: "altText" in msg ? msg.altText : null,
  });
}

// POST { userId } → その人にカルーセルを送る（見え方の確認用）
export async function POST(req: NextRequest) {
  try {
    const { userId } = (await req.json()) as { userId?: string };
    if (!userId) return NextResponse.json({ error: "userId が必要です" }, { status: 400 });
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    if (!token) return NextResponse.json({ error: "LINE_CHANNEL_ACCESS_TOKEN が未設定" }, { status: 500 });

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: userId, messages: [eventCarousel()] }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `送信に失敗(${res.status})`, details: (await res.text()).slice(0, 400) },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "送信に失敗" },
      { status: 500 },
    );
  }
}
