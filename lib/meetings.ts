// ミーティングの議題と決定事項。
//
// 話すことを事前に並べておき、当日その場で「決まったこと」と
// 「誰が何をやるか」を書き込む。あとから前回何を決めたかを追える。
//
// 決めるだけで終わって誰も動かない、を防ぐのが目的なので、
// 議題ごとに必ずボールを持つ人（owner）を置く。

const KEY = "meetings:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export const STATUSES = ["未着手", "進行中", "要決定", "完了", "保留"] as const;
export type Status = (typeof STATUSES)[number];

export type Action = {
  id: string;
  who: string;
  what: string;
  due?: string;
  done?: boolean;
};

export type Topic = {
  id: string;
  title: string;
  /** ボールを持つ人 */
  owner?: string;
  status: Status;
  /** なぜやるのか。目的を毎回書いておくと議論がぶれない */
  why?: string;
  /** 話す中身 */
  points: string[];
  /** 当日書き込む決定事項 */
  decision?: string;
  actions: Action[];
};

export type Meeting = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  note?: string;
  topics: Topic[];
};

/** 最初から入れておく分。KVに同じidがあればそちらが優先 */
export const SEED_MEETINGS: Meeting[] = [
  {
    id: "2026-09-06",
    date: "2026-09-06",
    title: "9/6 定例MTG",
    topics: [
      {
        id: "yakuin",
        title: "役員報酬の決定（総社員の同意）",
        owner: "坂本",
        status: "要決定",
        why:
          "定期同額給与として損金にできる決定期限が、事業年度開始から3か月＝9/9。" +
          "ここで決めないと今期の役員報酬は全額が経費にならない",
        points: [
          "業務執行社員3名（坂本・町田・櫻井）の報酬を各 月額¥62,999 とする",
          "¥62,999は社会保険の下限ぎりぎり。¥63,000以上にすると保険料が上がる",
          "櫻井は現在の定款では業務執行社員ではないため、定款第8条の変更が必要",
          "会社の実負担は3人で月¥222,777（報酬¥188,997＋社保会社負担¥33,780）",
          "今期（2027年3月末まで）は増減できない",
        ],
        actions: [
          { id: "a1", who: "全員", what: "総社員の同意書に記名押印（4名）" },
          { id: "a2", who: "櫻井", what: "就任承諾書に記名押印" },
          { id: "a3", who: "坂本・町田・櫻井", what: "給与所得者の扶養控除等申告書を記入" },
          { id: "a4", who: "坂本", what: "本日中に¥62,999×3＝¥188,997を振込", due: "2026-09-06" },
          { id: "a5", who: "坂本", what: "社会保険の新規適用届・資格取得届3名分", due: "2026-09-11" },
          { id: "a6", who: "坂本", what: "業務執行社員の変更登記（登録免許税¥1万）", due: "2026-09-20" },
        ],
      },
      {
        id: "nov-event",
        title: "11月 周辺店舗との共同イベント",
        owner: "坂本",
        status: "進行中",
        why:
          "キャッスルロード・四番町スクエアは観光客の動線があるが、こちらの商店街は" +
          "観光客の動線が弱く、彦根市民もなかなか来ない。まず人を呼び寄せ、" +
          "「この商店街って遊ぶのに結構おもしろくね？」と観光客にも市民にも思わせる。" +
          "その後も定期的にこのエリアへ来てもらえるようにする。" +
          "あわせて周辺店舗・ステークホルダーとのタッチポイントを作る",
        points: [
          "同じイベントをやるのではなく、各店が別のイベントをする。ただし共同のイベント名のもと、同じ方向を向いて同じ日にやる",
          "11月は食の秋・文化の秋・スポーツの秋。「彦根文化祭」のような文化的な企画を各店で",
          "NOWON・こんき食堂は乗り気。この2店はマスト",
          "こんき食堂はNOWONに行ってみたいがまだ行けていない。NOWON側も同じ課題を抱えていて、来るきっかけを作りたいとのこと",
          "声をかけたい先: 沖縄料理ピーター／山の湯／ジャンゴ／アンドアン／ななばけ／金亀公園イベントの伊藤さん",
        ],
        actions: [
          { id: "n1", who: "坂本", what: "火曜にNOWON田中さんとこんき食堂へ。そこで日程を詰める" },
          { id: "n2", who: "坂本", what: "日程が押さえられたら他店に声をかける" },
        ],
      },
      {
        id: "oboe",
        title: "オーボエイベント",
        owner: "櫻井",
        status: "進行中",
        why: "文化的な催しで、普段来ない層に来てもらう",
        points: ["すでに打ち合わせ済み"],
        actions: [
          { id: "o1", who: "國仲", what: "宣伝用のリールを作る" },
          { id: "o2", who: "坂本", what: "申し込みフォームを作る" },
          { id: "o3", who: "町田", what: "簡易的なフライヤーを作る" },
        ],
      },
      {
        id: "dj",
        title: "DJイベント（9/22）",
        owner: "坂本",
        status: "進行中",
        why: "火曜の定休日に開けるので、通常営業の機会損失なしで売上が丸ごと上乗せになる",
        points: [
          "DJ蓮：交通費込みで¥20,000（確定）",
          "料金は 飲み放題¥3,500／ほろ酔い3杯¥2,500／エントランス＋1ドリンク¥1,000",
          "テキーラショット¥200を100杯（＝4本）出せればDJ代がちょうど回収できる",
          "目標¥150,000（40人）／最低ライン¥100,000（25人）／損益分岐15人",
          "確定9名。あと31人",
          "申し込みフォームと事前決済リンクは作成済み",
        ],
        actions: [
          { id: "d1", who: "坂本", what: "テキーラを4本以上仕入れる（ボトル売り込みなら6本）" },
          { id: "d2", who: "全員", what: "集客。確定9名からあと31人" },
          { id: "d3", who: "坂本", what: "9/22の3人体制シフトを押さえる（定休日なので別枠）" },
        ],
      },
      {
        id: "game-night",
        title: "ゲームナイト",
        owner: "",
        status: "未着手",
        why: "",
        points: ["進捗を共有する", "ボールを持つ人を決める"],
        actions: [
          { id: "g1", who: "坂本", what: "申し込みフォームを作る（作るなら）" },
        ],
      },
      {
        id: "running",
        title: "ランニングクラブ",
        owner: "坂本",
        status: "保留",
        why:
          "彦根で積極的にランニングをしている団体を応援したい。" +
          "flat.のTシャツを着て走り、ゴールをflat.にしてもらうことで、" +
          "走ったあとの立ち寄りを売上につなげる",
        points: [
          "将来的には学生主体のものにしたい",
          "まず坂本が毎週木曜日にやってみるところから始める",
          "委託・スポンサー料の設計は坂本が構想を練ってから改めて",
        ],
        actions: [
          { id: "r1", who: "坂本", what: "構想をまとめて次回持ち込む" },
        ],
      },
      {
        id: "second-floor",
        title: "2Fのオープンについて",
        owner: "",
        status: "未着手",
        why: "",
        points: ["現状と、いつ開けるかを共有する"],
        actions: [],
      },
    ],
  },
];

export async function getMeetings(): Promise<Meeting[]> {
  const store = await kv();
  const saved = store ? (await store.get<Meeting[]>(KEY)) ?? [] : [];
  const map = new Map<string, Meeting>();
  for (const m of SEED_MEETINGS) map.set(m.id, m);
  for (const m of saved) map.set(m.id, m);
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function saveMeeting(m: Meeting): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const saved = (await store.get<Meeting[]>(KEY)) ?? [];
  const i = saved.findIndex((x) => x.id === m.id);
  if (i >= 0) saved[i] = m;
  else saved.push(m);
  await store.set(KEY, saved);
}

export async function deleteMeeting(id: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const saved = (await store.get<Meeting[]>(KEY)) ?? [];
  await store.set(KEY, saved.filter((x) => x.id !== id));
}

/** まだ終わっていない宿題。全MTG横断で見る */
export function openActions(meetings: Meeting[]) {
  const out: { meeting: string; date: string; topic: string; action: Action }[] = [];
  for (const m of meetings) {
    for (const t of m.topics) {
      for (const a of t.actions) {
        if (!a.done) out.push({ meeting: m.title, date: m.date, topic: t.title, action: a });
      }
    }
  }
  return out;
}
