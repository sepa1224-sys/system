// ホットサンドの仕込み在庫。
//
// 回し方は「冷蔵庫は常に各3個、冷凍庫が本体の在庫」。
// 出したら冷凍庫から冷蔵庫へ移して補充する。
//
// 数えるのは15時。冷凍庫の合計が5個を切っていたら、その日のうちに
//   ・食パンを平和堂に連絡する（翌日届く）
//   ・翌日10個仕込むので、たねを仕込む
// をやる。閉めるときは冷蔵庫を各3個にそろえるだけ。
//
// 仕込みは前回から3日空ける。3日を待たずに仕込んだ場合は、
// その日を起点に数え直す（次は仕込んだ日＋3日）。

export const HOTSAND_FLAVORS = ["クラシックメルト", "ガーデンメルト"] as const;
export type Flavor = (typeof HOTSAND_FLAVORS)[number];

/** 閉めるときに冷蔵庫にそろえる数（フレーバーごと） */
export const FRIDGE_PAR = 3;
/** 15時に数えて、冷凍庫の合計がこれを切っていたら動く（2フレーバーの合算） */
export const FREEZER_LOW_TOTAL = 5;
/** 1回に仕込む数 */
export const BATCH = 10;
/** 仕込みの間隔。前回仕込んだ日から数える */
export const PREP_INTERVAL_DAYS = 3;

const KEY = "hotsand:counts";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Entry = {
  /** 冷蔵庫にそろえた数。ふつうは各3個 */
  fridge: Record<string, number>;
  /** 冷凍庫の残り。これが判断の中心 */
  freezer: Record<string, number>;
  /** ホットサンドのタネが仕込んであるか */
  tane: boolean;
  at: string;
};

/** 15時に数えた冷凍庫の残り。発注と仕込みの判断はこれで行う */
export type Afternoon = { freezer: Record<string, number>; at: string };

/** 仕込んだ記録。何個作って冷凍庫に入れたか */
export type Made = { freezer: Record<string, number>; at: string };

type Day = { night?: Entry; afternoon?: Afternoon; made?: Made };
type Store = Record<string, Day>;

export async function getAll(): Promise<Store> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Store>(KEY)) ?? {};
}

async function put(all: Store): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const keep = Object.keys(all).sort().slice(-365);
  const next: Store = {};
  for (const d of keep) next[d] = all[d];
  await store.set(KEY, next);
}

const zero = () => Object.fromEntries(HOTSAND_FLAVORS.map((f) => [f, 0]));

/** 閉めるときの記録 */
export async function saveNight(
  date: string,
  fridge: Record<string, number>,
  freezer: Record<string, number>,
  tane: boolean,
): Promise<Entry> {
  const all = await getAll();
  const day = all[date] ?? {};
  const entry: Entry = {
    fridge: { ...zero(), ...fridge },
    freezer: { ...zero(), ...freezer },
    tane,
    at: new Date().toISOString(),
  };
  day.night = entry;
  all[date] = day;
  await put(all);
  return entry;
}

/** 15時に数えた冷凍庫の残り */
export async function saveAfternoon(
  date: string,
  freezer: Record<string, number>,
): Promise<Afternoon> {
  const all = await getAll();
  const day = all[date] ?? {};
  const entry: Afternoon = {
    freezer: { ...zero(), ...freezer },
    at: new Date().toISOString(),
  };
  day.afternoon = entry;
  all[date] = day;
  await put(all);
  return entry;
}

/** 仕込んだ数。冷凍庫に入れた分を、その日の記録に足す */
export async function saveMade(
  date: string,
  freezer: Record<string, number>,
): Promise<Made> {
  const all = await getAll();
  const day = all[date] ?? {};
  const prev = day.made?.freezer ?? zero();
  const made: Made = {
    freezer: Object.fromEntries(
      HOTSAND_FLAVORS.map((f) => [f, (prev[f] ?? 0) + (Number(freezer[f]) || 0)]),
    ),
    at: new Date().toISOString(),
  };
  day.made = made;
  all[date] = day;
  await put(all);
  return made;
}

export function yesterdayOf(date: string): string {
  return shiftDate(date, -1);
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const daysApart = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  );

const sum = (r: Record<string, number> | undefined) =>
  r ? HOTSAND_FLAVORS.reduce((n, f) => n + (r[f] ?? 0), 0) : 0;

/** 冷凍庫が少ないフレーバー（表示用） */
export function lowFlavors(entry: { freezer: Record<string, number> } | undefined) {
  if (!entry) return [];
  return HOTSAND_FLAVORS.map((f) => ({ flavor: f, left: entry.freezer[f] ?? 0 }))
    .filter((x) => x.left === 0);
}

export async function dayState(date: string) {
  const all = await getAll();
  const today = all[date] ?? {};
  const yst = all[yesterdayOf(date)] ?? {};

  // 最後に仕込んだ日。ここから3日空けて次を仕込む
  const madeDates = Object.keys(all)
    .filter((d) => d <= date && sum(all[d].made?.freezer) > 0)
    .sort();
  const lastMade = madeDates.length ? madeDates[madeDates.length - 1] : null;
  const nextPrep = lastMade ? shiftDate(lastMade, PREP_INTERVAL_DAYS) : null;

  // 15時の記録。まだなら夜の記録で代用する
  const count = today.afternoon ?? (today.night ? { freezer: today.night.freezer, at: today.night.at } : undefined);
  const total = sum(count?.freezer);
  const short = !!count && total < FREEZER_LOW_TOTAL;

  const madeToday = sum(today.made?.freezer);
  const yTotal = sum(yst.afternoon?.freezer);
  const yShort = !!yst.afternoon && yTotal < FREEZER_LOW_TOTAL;

  // 明日が「前回から3日目」なら、今日のうちにたねを仕込む
  const prepTomorrow = nextPrep !== null && nextPrep === shiftDate(date, 1);
  // 今日が予定日、または昨日15時に足りなかった → 今日10個仕込む
  const needPrep = madeToday === 0 && ((nextPrep !== null && date >= nextPrep) || yShort);
  // 今日のうちにたねを仕込む（明日仕込むことが決まったとき）
  const needTane = !today.night?.tane && (short || prepTomorrow);
  // 15時に足りなければ、その日のうちに食パンを頼む
  const needBreadCall = short;

  return {
    flavors: [...HOTSAND_FLAVORS],
    fridgePar: FRIDGE_PAR,
    freezerLowTotal: FREEZER_LOW_TOTAL,
    batch: BATCH,
    intervalDays: PREP_INTERVAL_DAYS,
    afternoon: {
      counted: !!today.afternoon,
      freezer: today.afternoon?.freezer ?? null,
      total: today.afternoon ? sum(today.afternoon.freezer) : null,
    },
    night: {
      counted: !!today.night,
      fridge: today.night?.fridge ?? null,
      freezer: today.night?.freezer ?? null,
      tane: today.night?.tane ?? null,
    },
    lastMade,
    nextPrep,
    daysSinceMade: lastMade ? daysApart(lastMade, date) : null,
    total: count ? total : null,
    short,
    madeToday,
    needBreadCall,
    needTane,
    needPrep,
  };
}
