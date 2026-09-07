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
  /** Squareの事前決済リンク。当日払いだけのイベントでは空でよい */
  payUrl?: string;
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
  /** 自由記入欄の見出し。イベントごとに聞きたいことが違うので、無ければ欄を出さない */
  requestLabel?: string;
  requestPlaceholder?: string;
  /** 申込画面と完了画面に出すお願いごと */
  notes?: string[];
  /** LINE通知に付ける絵文字 */
  emoji?: string;
  /** LINEの友だち追加を必須にする。LINEから開かないと申し込めなくなる */
  requireLine?: boolean;
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
        label: "🍻 飲み放題＋エントランス",
        price: 3500,
        detail: "入場料込み。ビールは1杯まで、それ以外は何杯でも",
        payUrl: "https://square.link/u/ClilfinY",
      },
      {
        id: "entrance",
        label: "🎟 エントランスのみ",
        price: 1000,
        detail: "入場料のみ。ドリンクは単品で好きなだけ注文できます",
        payUrl: "https://square.link/u/taJyQqUU",
      },
    ],
    requireLine: true,
    notes: [
      "当日フードの提供はありません。ドリンクのみです",
      "飲み放題のビールは1杯までです",
    ],
    requestLabel: "DJへのリクエスト（任意）",
    requestPlaceholder: "聴きたい曲・ジャンルなど",
    emoji: "🎧",
  },
  {
    slug: "oboe",
    title: "オーボエ ミニ演奏会",
    dateLabel: "9月26日（土）",
    date: "2026-09-26",
    lead: "須田聡子さんをお迎えして、30分ほどのミニコンサートです🎶",
    // 夜公演の開場まで受け付ける。過ぎても当日参加は受ける
    deadline: "2026-09-26T20:00:00+09:00",
    kvKey: "oboe:entries",
    plans: [
      {
        id: "day",
        label: "☀️ 昼公演 14:00〜",
        price: 500,
        detail: "13:30開場／14:00開演。入場料500円＋1オーダー",
      },
      {
        id: "night",
        label: "🌙 夜公演 21:00〜",
        price: 500,
        detail: "20:30開場／21:00開演。入場料500円＋1オーダー",
      },
    ],
    requireLine: true,
    requestLabel: "須田さんへのメッセージ（任意）",
    requestPlaceholder: "楽しみにしていること、聴きたい曲など",
    notes: [
      "入場料は500円＋ワンドリンクオーダー制です（3歳以下は無料）",
      "開演10分前までにドリンクのオーダーを済ませてください",
      "携帯電話はマナーモードに（バイブも切ってください）",
      "動画の撮影はご遠慮ください。写真は音に配慮のうえどうぞ",
      "お手洗いは曲と曲のあいだにお願いします",
      "いつもより少しおしゃれをしてくると、より楽しめます（任意）",
    ],
    emoji: "🎶",
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
