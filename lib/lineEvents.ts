import { EVENTS, type FlatEvent } from "@/lib/events";

// LINEで「イベント申込一覧」を出すためのカルーセル。
//
// リッチメニューのボタンを message アクション（テキスト送信）にしておき、
// Webhookがその言葉を見てこのカルーセルを返す。
// イベントが増えても lib/events.ts に足すだけで一覧に並ぶ。

const SITE = "https://flat-keihi.vercel.app";

// 名前はEventSignupと同じ順で拾う（環境ごとにどれが入っているか違うため）
const LIFF_ID =
  process.env.NEXT_PUBLIC_LIFF_ID_EVENT ||
  process.env.NEXT_PUBLIC_LIFF_ID_DJNIGHT ||
  process.env.NEXT_PUBLIC_LIFF_ID_NATSUMATSURI ||
  "";

// LINEから開いてもらう入口。LIFFなら名前とLINE IDが自動で入る。
// LIFF IDが未設定のときは普通のURLにする（ログインを挟むが申込はできる）。
function signupUrl(slug: string): string {
  return LIFF_ID ? `https://liff.line.me/${LIFF_ID}/${slug}` : `${SITE}/e/${slug}`;
}

/** 開催日を過ぎていないイベントを、近い順に */
export function upcomingEvents(now: Date = new Date()): FlatEvent[] {
  const jst = new Date(now.getTime() + (9 - 6) * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return [...EVENTS]
    .filter((e) => e.date >= jst)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function bubble(ev: FlatEvent) {
  const url = signupUrl(ev.slug);
  // 料金は一番安いプランから。プランが1つならその値段だけ
  const prices = ev.plans.map((p) => p.price);
  const from = Math.min(...prices);
  const priceText =
    prices.length > 1
      ? `¥${from.toLocaleString()}〜`
      : `¥${from.toLocaleString()}`;

  return {
    type: "bubble",
    size: "mega",
    ...(ev.ogImage
      ? {
          hero: {
            type: "image",
            url: `${SITE}${ev.ogImage}`,
            size: "full",
            aspectRatio: "1200:630",
            aspectMode: "cover",
            action: { type: "uri", label: ev.title, uri: url },
          },
        }
      : {}),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: `${ev.emoji ? `${ev.emoji} ` : ""}${ev.dateLabel}`,
          size: "sm",
          color: "#B5651D",
          weight: "bold",
        },
        { type: "text", text: ev.title, size: "xl", weight: "bold", wrap: true },
        {
          type: "text",
          text: ev.lead,
          size: "sm",
          color: "#7A756E",
          wrap: true,
          margin: "sm",
        },
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          spacing: "sm",
          contents: ev.plans.map((p) => ({
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: p.label,
                size: "sm",
                color: "#3B3833",
                flex: 5,
                wrap: true,
              },
              {
                type: "text",
                text: `¥${p.price.toLocaleString()}`,
                size: "sm",
                color: "#3B3833",
                align: "end",
                flex: 2,
                weight: "bold",
              },
            ],
          })),
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#B5651D",
          height: "sm",
          action: { type: "uri", label: `申し込む（${priceText}）`, uri: url },
        },
      ],
    },
  };
}

/**
 * 受付中のイベント一覧をカルーセルで返す。
 * イベントが無いときは案内のテキストを返す。
 */
export function eventCarousel(now: Date = new Date()) {
  const evs = upcomingEvents(now).slice(0, 10); // カルーセルは10件まで
  if (evs.length === 0) {
    return {
      type: "text",
      text: "いま受け付けているイベントはありません🌙\n次の企画をお待ちください。",
    };
  }
  return {
    type: "flex",
    altText: `flat. イベント申込（${evs.map((e) => e.title).join("・")}）`,
    contents: { type: "carousel", contents: evs.map(bubble) },
  };
}

/** リッチメニューのボタンから送られてくる言葉 */
export const EVENT_LIST_KEYWORD = "イベント申込";

/** カルーセルを出すべき問いかけかどうか */
export function wantsEventList(text: string): boolean {
  const t = text.trim();
  return /イベント|申込|申し込み|もうしこみ/.test(t);
}
