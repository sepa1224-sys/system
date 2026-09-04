// イベントの登録簿。
//
// LINEのリッチメニューとLIFFの設定を、イベントのたびに触らなくて済むようにする。
//
//   LIFFのエンドポイント : https://flat-keihi.vercel.app/e   … 一度きり
//   リッチメニューのリンク: https://liff.line.me/{LIFF ID}   … 一度きり
//
// あとはこの配列に足すだけで、/e が「いま受け付けているイベント」を出す。
// 個別に案内したいときは /e/{slug} を直接渡してもよい。

export type EventPlan = {
  id: string;
  label: string;
  price: number;
  detail: string;
  /** Squareの事前決済リンク */
  payUrl: string;
};

export type FlatEvent = {
  slug: string;
  title: string;
  /** 表に出す日付の書き方 */
  dateLabel: string;
  /** 開催日 YYYY-MM-DD */
  date: string;
  lead: string;
  /** 事前申込の締切（JST）。過ぎても当日参加は受ける */
  deadline: string;
  /** 申込を保存するKVのキー */
  kvKey: string;
  plans: EventPlan[];
};

export const EVENTS: FlatEvent[] = [
  {
    slug: "djnight",
    title: "flat. DJ NIGHT",
    dateLabel: "9月22日（火）",
    date: "2026-09-22",
    lead: "定休日のflat.を、この日だけ開けます🎧",
    deadline: "2026-09-22T18:00:00+09:00",
    kvKey: "djnight:entries",
    plans: [
      {
        id: "nomihodai",
        label: "🍻 飲み放題",
        price: 3500,
        detail: "ビールは1杯まで。それ以外は何杯でも",
        payUrl: "https://square.link/u/ClilfinY",
      },
      {
        id: "horoyoi",
        label: "🥂 ほろ酔い3杯",
        price: 2500,
        detail: "ノンアル・アルコールどちらでも3杯（ビールは1本まで）",
        payUrl: "https://square.link/u/CHbcLNNw",
      },
      {
        id: "entrance",
        label: "🎟 エントランス＋1ドリンク",
        price: 1000,
        detail: "入場＋お好きなドリンク1杯。2杯目からは単品で注文",
        payUrl: "https://square.link/u/taJyQqUU",
      },
    ],
  },
];

export function eventOf(slug: string): FlatEvent | undefined {
  return EVENTS.find((e) => e.slug === slug);
}

/**
 * いま案内すべきイベント。
 * 開催日を過ぎていないもののうち、いちばん近い日のもの。
 * 当日は一日中出す（深夜まで営業するため、翌朝6時までを当日とみなす）。
 */
export function currentEvent(now: Date = new Date()): FlatEvent | undefined {
  const jst = new Date(now.getTime() + (9 - 6) * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return [...EVENTS]
    .filter((e) => e.date >= jst)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
}
