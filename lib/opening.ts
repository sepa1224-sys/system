// 業務チェックリスト。朝・営業中・締め・週次でやることをまとめる。
// 手順書ではなく「今日やったかどうか」を見るためのもので、
// 日付が変わればまっさらに戻る。
//
// 発注だけは毎日ではないので、最後にやった日から何日経ったかで出す。

const KEY = "opening:done";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** 朝＝開店前 ／ 営業中＝手が空いたとき ／ 締め＝閉店後 ／ 週次＝曜日が決まっているもの */
export type Phase = "朝" | "営業中" | "締め" | "週次";

export type Task = {
  id: string;
  phase: Phase;
  name: string;
  /** 迷いやすいところの補足 */
  detail?: string;
  /** 毎日ではない作業。何日おきか */
  everyDays?: number;
  /** 決まった曜日だけの作業。0=日 */
  weekday?: number;
  /** 夜にワッフルの残数を入力する作業 */
  waffleCount?: boolean;
  /** 前夜の残数を見て、朝焼くかどうかを出す作業 */
  waffleMorning?: boolean;
  /** 発注リストへ行く作業 */
  orderList?: boolean;
  /** 届いていない発注があるときだけ出す作業 */
  pendingOrder?: boolean;
  /** 「やった／今日はやらなくていい」を選ぶ作業。押したほうが記録される */
  choices?: [string, string];
  /** 閉めるときにホットサンドを整える作業 */
  hotsand?: "night";
  /** ホットサンドが足りないときだけ出す仕込みの作業 */
  hotsandPrep?: boolean;
  /** 牛乳・コールドブリュー・水を数える作業。朝か夜か */
  daily?: "morning" | "evening";
  /** 数えた結果、足りないときだけ出す手当ての作業 */
  dailyAction?: "buy" | "prep" | "refill";
  /** 夜の残数を見て、生地を仕込む必要があるときだけ出す作業 */
  wafflePrep?: boolean;
};

// ホットサンドの在庫チェックは、運用が固まるまで業務チェックから外している。
// 中身（lib/hotsand.ts と API の受け口）はそのまま残してあるので、
// 下の2つを TASKS に戻せば復活する。
//
//   { id: "hotsand-night", phase: "締め",
//     name: "ホットサンドを冷蔵庫に3つずつそろえる", hotsand: "night" }
//   { id: "hotsand-prep", phase: "営業中",
//     name: "ホットサンドを10個仕込む", hotsandPrep: true }

export const TASKS: Task[] = [
  {
    id: "espresso",
    phase: "朝",
    name: "エスプレッソマシンを立ち上げる",
    detail: "いちばん時間がかかるので最初に電源を入れる",
  },
  { id: "clean-floor", phase: "朝", name: "店舗掃除（掃除機・テーブル拭き）" },
  { id: "clean-toilet", phase: "朝", name: "トイレ掃除" },
  {
    id: "trash-bag",
    phase: "朝",
    name: "ゴミ袋がセットされているか確認",
    detail: "袋をつけるのは締めの作業。抜けていたらここで気づく",
  },
  {
    id: "waffle",
    phase: "朝",
    name: "ワッフルをセットする",
    detail:
      "前日に焼いたものが冷蔵庫にあればそれをセット。無ければ前日に仕込んだ生地を焼く。廃棄期限は2日。" +
      "どちらをしたか押しておくと、今夜の生地の仕込みが要るかを自動で判断する",
    /** 前夜に数えた残数から、焼くかどうかを出し分ける */
    waffleMorning: true,
  },
  {
    id: "dishes",
    phase: "朝",
    name: "前日洗った食器類を片付ける",
    detail: "ワッフルの準備をしながら進める",
  },
  {
    id: "duster",
    phase: "朝",
    name: "ダスターを畳んで片付ける",
    detail:
      "前の晩に干したものが乾いていたら畳む。煮沸は3日に1回だが、汚れが溜まっていればその場で煮沸して干す",
  },
  {
    id: "daily-morning",
    phase: "朝",
    name: "牛乳・パン・コールドブリュー・水を数える",
    detail: "切れると出せなくなるものだけ、朝と夜に必ず見る",
    daily: "morning",
  },
  {
    id: "daily-buy",
    phase: "朝",
    name: "牛乳・パンを手配する",
    detail:
      "平和堂に電話して持ってきてもらうか、午後のシフトの人に買い出しを頼む。" +
      "前の晩に足りなかった場合も、翌朝ここに出る",
    dailyAction: "buy",
  },
  {
    id: "daily-prep",
    phase: "営業中",
    name: "コールドブリューを仕込む",
    detail:
      "抽出に時間がかかるので、気づいた時点ですぐ仕込む。夜21時の時点で1本しかなければ、その晩のうちに仕込む",
    dailyAction: "prep",
  },
  {
    id: "dishes-put-away",
    phase: "営業中",
    name: "16時半に洗ってある食器を全部片付ける",
    detail: "夜の営業前に洗い場を空にしておく",
  },
  {
    id: "candle-set",
    phase: "営業中",
    name: "18時45分にキャンドルを置く",
    detail: "夜の営業前の準備。充電は金曜の締めでやる",
  },
  {
    id: "daily-evening",
    phase: "締め",
    name: "牛乳・パン・コールドブリュー・水を数える（夜）",
    detail: "21時ごろに数える。足りないものは翌朝の手当てとして自動で出る",
    daily: "evening",
  },
  {
    id: "stock-check",
    phase: "営業中",
    name: "その日の在庫補充",
    detail:
      "台下冷蔵庫に飲み物が全部入っているか確認し、足りなければストックルームから補充する",
  },
  {
    id: "stockroom-check",
    phase: "営業中",
    name: "ストックルームの補充",
    detail:
      "倉庫からストックルームへ補充する。倉庫に無くて補充できなかったものが発注するもの。「📦 ストック確認」のページで記録する",
    everyDays: 3,
  },
  {
    id: "order-reconcile",
    phase: "締め",
    name: "会計済みなのに残っている注文がないか確認",
    detail:
      "注文画面にテーブルが埋まったまま残っていたら、Square側では会計が済んでいる可能性が高い。「残った注文を片付ける」を押すと自動で照合して閉じる",
  },
  {
    id: "order",
    phase: "営業中",
    name: "足りないものを発注する",
    detail:
      "ストック確認で倉庫に無かったものが「📋 発注リスト」に並ぶ。数を決めて買い、「発注済みにする」を押す",
    everyDays: 3,
    orderList: true,
  },
  {
    id: "order-arrival",
    phase: "営業中",
    name: "発注したものが届いたか確認する",
    detail:
      "届いていたら「届いた」を押す。押すまでその品目は発注リストに出てこないので、二重に発注しない",
    pendingOrder: true,
  },

  {
    id: "waffle-count",
    phase: "締め",
    name: "22時にワッフルの残りを数える",
    detail:
      "3フレーバーそれぞれの残りを入力する。2個以下のフレーバーがあれば翌日用に生地を仕込む",
    /** 残数を入力してもらう。翌朝の判断にそのまま使う */
    waffleCount: true,
  },
  {
    id: "espresso-close",
    phase: "締め",
    name: "23時にエスプレッソマシンを閉める",
    detail: "ラストオーダーの前に落とす。以降はドリップで対応する",
  },
  {
    id: "last-order",
    phase: "締め",
    name: "23時半にラストオーダーを聞く",
    detail: "お客さん全席に回って聞く",
  },
  {
    id: "waffle-prep",
    phase: "締め",
    name: "明日の分のワッフル生地を仕込む",
    detail:
      "22時に数えた結果、2個以下のフレーバーがあれば今夜のうちに仕込む。" +
      "翌朝それを焼くので、仕込まないと明日出せない",
    wafflePrep: true,
  },
  { id: "dishes-wash", phase: "締め", name: "食器を洗う" },
  {
    id: "trash-burnable",
    phase: "締め",
    name: "燃えるゴミをまとめて新しい袋をつける",
    detail: "トイレとホールのゴミも一緒に集めてから、新しい袋をセットする",
  },
  {
    id: "trash-recycle",
    phase: "締め",
    name: "缶・瓶・牛乳パックのゴミ箱を見る",
    detail:
      "溜まっていたら分別してまとめておく。まとまった分はゴミセンターへ持って行く",
    choices: ["溜まったので分別した", "まだ溜まっていない"],
  },
  {
    id: "drain-clean",
    phase: "締め",
    name: "排水溝を掃除する",
    weekday: 1,
  },
  {
    id: "duster-boil",
    phase: "締め",
    name: "ダスターを煮沸して干す",
    detail: "翌朝、乾いていたら畳んで片付ける",
    everyDays: 3,
  },
  {
    id: "cash-close",
    phase: "締め",
    name: "レジを締める",
    detail: "手順は「レジ締め」のページにあります",
  },
  {
    id: "stove-clean",
    phase: "締め",
    name: "コンロまわりとトースターを掃除する",
    detail: "コンロを拭く → コンロ付近を掃除する → トースターを清掃する",
    weekday: 3,
  },
  {
    id: "sink-coat",
    phase: "締め",
    name: "シンク・台下冷蔵庫・製氷機の上を磨く",
    detail: "洗浄 → 研磨 → コーティング剤を散布、の順にやる",
    weekday: 4,
  },
  {
    id: "candle-charge",
    phase: "締め",
    name: "キャンドルライトを充電する",
    detail: "週末に切れないよう、金曜の締めで充電しておく",
    weekday: 5,
  },
  {
    id: "grinder-wash",
    phase: "週次",
    name: "グラインダーの備品を洗う",
    detail: "毎週水曜の締め作業で行う。それ以外の日は拭くだけ",
    weekday: 3,
  },
];

/** 日付ごとの、終わった作業のid */
type DoneMap = Record<string, string[]>;

/**
 * 業務チェックの「今日」。営業日は朝6時で切り替える。
 *
 * 24時半まで営業しているので、締め作業の途中で日付が変わってしまう。
 * カレンダーどおりだと0時を回った瞬間に翌日のまっさらなリストになり、
 * それまでチェックした分が見えなくなる。朝6時までは前日として扱う。
 */
export function todayJST(): string {
  return new Date(Date.now() + (9 - 6) * 3600 * 1000).toISOString().slice(0, 10);
}

async function load(): Promise<DoneMap> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<DoneMap>(KEY)) ?? {};
}

async function save(m: DoneMap) {
  const store = await kv();
  if (!store) return;
  // 古い記録は消す。60日分だけ残す
  const keep = Object.keys(m).sort().slice(-60);
  const next: DoneMap = {};
  for (const d of keep) next[d] = m[d];
  await store.set(KEY, next);
}

export async function getDone(date: string): Promise<string[]> {
  return (await load())[date] ?? [];
}

export async function toggle(date: string, taskId: string, done: boolean) {
  const m = await load();
  const cur = new Set(m[date] ?? []);
  if (done) cur.add(taskId);
  else cur.delete(taskId);
  m[date] = [...cur];
  await save(m);
  return [...cur];
}

/** その作業を最後にやった日。一度もなければ null */
export async function lastDoneDate(taskId: string): Promise<string | null> {
  const m = await load();
  const days = Object.keys(m)
    .filter((d) => (m[d] ?? []).includes(taskId))
    .sort();
  return days.length ? days[days.length - 1] : null;
}

const CHOICE_KEY = "opening:choice";

/** 日付 → 作業id → 選んだ答え */
type ChoiceMap = Record<string, Record<string, string>>;

export async function getChoices(date: string): Promise<Record<string, string>> {
  const store = await kv();
  if (!store) return {};
  return ((await store.get<ChoiceMap>(CHOICE_KEY)) ?? {})[date] ?? {};
}

export async function saveChoice(date: string, taskId: string, answer: string) {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = (await store.get<ChoiceMap>(CHOICE_KEY)) ?? {};
  all[date] = { ...(all[date] ?? {}), [taskId]: answer };
  const keep = Object.keys(all).sort().slice(-120);
  const next: ChoiceMap = {};
  for (const d of keep) next[d] = all[d];
  await store.set(CHOICE_KEY, next);
  return all[date];
}

const WAFFLE_KEY = "opening:waffle";

/** フレーバー名。ワッフルは3種類 */
export const WAFFLE_FLAVORS = ["プレーン", "チョコチップ", "抹茶"] as const;

/**
 * 日付 → フレーバーごとの残数。
 * bakedAt はいま冷蔵庫にあるものを焼いた日。
 * baked は「今朝、焼いたのか（true）冷蔵庫から出したのか（false）」。
 * 焼いた日が分からない日でも押したことが残るよう、別に持つ。
 */
type WaffleDay = { counts: Record<string, number>; bakedAt?: string; baked?: boolean };
type WaffleMap = Record<string, WaffleDay>;

export async function getWaffleCounts(): Promise<WaffleMap> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<WaffleMap>(WAFFLE_KEY)) ?? {};
}

/**
 * その日のワッフルの記録を書く。
 * 朝は bakedAt だけ、夜は counts だけを書くので、渡さなかったほうは今の値を残す。
 */
export async function saveWaffleCount(
  date: string,
  counts?: Record<string, number>,
  bakedAt?: string,
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getWaffleCounts();
  const cur = all[date] ?? { counts: {} };
  const keepBaked = bakedAt || cur.bakedAt;
  all[date] = {
    counts: counts ?? cur.counts,
    ...(keepBaked ? { bakedAt: keepBaked } : {}),
    ...(cur.baked !== undefined ? { baked: cur.baked } : {}),
  };
  const keep = Object.keys(all).sort().slice(-60);
  const next: WaffleMap = {};
  for (const d of keep) next[d] = all[d];
  await store.set(WAFFLE_KEY, next);
}

/**
 * 朝、ワッフルを焼いたのか冷蔵庫から出したのかを記録する。
 *
 * これが分かると、夜に生地を仕込むかどうかが自動で決まる。
 * 焼いた日なら冷蔵庫のものは今日焼きたてなので明日も出せる。
 * 冷蔵庫から出しただけなら、そのワッフルは前に焼いたものなので、
 * 明日には期限切れになり、今夜のうちに生地を仕込む必要がある。
 */
export async function setWaffleBaked(date: string, baked: boolean): Promise<string | undefined> {
  const all = await getWaffleCounts();
  // 焼いたなら今日が焼いた日。出しただけなら前日までの焼いた日を引き継ぐ。
  // 引き継ぐ日が無いこともあるので、押したこと自体は baked に残す
  const carried = all[yesterdayOf(date)]?.bakedAt;
  const bakedAt = baked ? date : carried;
  const cur = all[date] ?? { counts: {} };
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  all[date] = { counts: cur.counts, baked, ...(bakedAt ? { bakedAt } : {}) };
  const keep = Object.keys(all).sort().slice(-60);
  const next: WaffleMap = {};
  for (const d of keep) next[d] = all[d];
  await store.set(WAFFLE_KEY, next);
  return bakedAt;
}

export function yesterdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 前夜の残数から、朝どうするかを決める。
 *
 * ワッフルの廃棄期限は2日なので、朝焼いたものは明後日には出せない。
 * そのため状態は次のように連鎖する。
 *
 *   夜に2個以下 → 生地を仕込む → 翌朝その生地を焼く
 *   夜に3個以上 → 仕込まない  → 翌朝は冷蔵庫のものをセット（＝持ち越し）
 *                              → その持ち越しは翌々日には期限切れになるので、
 *                                 その日の夜は必ず仕込み、翌朝は確定で焼く
 *
 * bakedAt は、いま冷蔵庫にあるワッフルを焼いた日。
 * これが2日前なら、今日はもう出せないので確定で焼く。
 */
export function morningPlan(
  counts: Record<string, number> | undefined,
  bakedAt?: string,
  today?: string,
) {
  // 期限切れの判定を最優先。焼いた日から2日経っていたら出せない
  if (bakedAt && today) {
    const age = daysBetween(bakedAt, today);
    if (age >= 2) {
      return {
        known: true,
        bake: [...WAFFLE_FLAVORS],
        mustBake: true,
        text: `冷蔵庫のワッフルは${bakedAt.slice(5).replace("-", "/")}に焼いたもので期限切れです。今朝は全フレーバーを焼いてください`,
      };
    }
  }
  if (!counts || Object.keys(counts).length === 0) {
    return {
      known: false,
      bake: [] as string[],
      mustBake: false,
      text: "前夜の残数が記録されていません。冷蔵庫を見て判断してください",
    };
  }
  const bake = WAFFLE_FLAVORS.filter((f) => (counts[f] ?? 0) <= 2);
  const detail = WAFFLE_FLAVORS.map((f) => `${f}${counts[f] ?? 0}個`).join("・");
  if (!bake.length) {
    const extra = bakedAt
      ? `（今あるものは${bakedAt.slice(5).replace("-", "/")}焼き。明日は期限切れになるので、今夜は必ず仕込んでください）`
      : "";
    return {
      known: true,
      bake: [],
      mustBake: false,
      text: `昨夜は${detail}。すべて3個以上あるので、今朝は焼かずに冷蔵庫のものをセットする${extra}`,
    };
  }
  return {
    known: true,
    bake: [...bake],
    mustBake: false,
    text: `昨夜は${detail}。${bake.join("・")}が2個以下なので、仕込んである生地を今朝焼く`,
  };
}

/**
 * 夜に生地を仕込むべきか。
 * 2個以下があれば仕込む。加えて、持ち越したワッフルが翌日に期限切れになるなら、
 * 残数にかかわらず必ず仕込む（翌朝焼くものが無くなるため）。
 */
export function nightPlan(
  counts: Record<string, number> | undefined,
  bakedAt?: string,
  today?: string,
  bakedToday?: boolean,
) {
  const low = counts
    ? WAFFLE_FLAVORS.filter((f) => (counts[f] ?? 0) <= 2)
    : [];
  // 今朝は焼かずに冷蔵庫から出した＝今あるものは前に焼いたもの。
  // 明日には出せなくなるので、残数にかかわらず仕込む
  if (bakedToday === false) {
    return {
      prep: true,
      text: "今朝は冷蔵庫のものを出したので、今あるワッフルは明日には期限切れです。今夜は生地を仕込んでください",
    };
  }
  // 今あるものが1日前に焼いたもの＝明日は2日目で出せない
  const expiring = !!(bakedAt && today && daysBetween(bakedAt, today) >= 1);
  if (expiring) {
    return {
      prep: true,
      text: `今あるワッフルは${bakedAt!.slice(5).replace("-", "/")}焼きで明日は期限切れです。残数にかかわらず今夜は生地を仕込んでください`,
    };
  }
  if (low.length) {
    return { prep: true, text: `${low.join("・")}が2個以下なので、明日用の生地を仕込んでください` };
  }
  return { prep: false, text: "すべて3個以上あるので、今夜は仕込まなくて大丈夫です" };
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  );
}
