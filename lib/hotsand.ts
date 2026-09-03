// ホットサンドの仕込み在庫。
//
// 回し方は「冷蔵庫は常に各3個、冷凍庫が本体の在庫」。
// 出したら冷凍庫から冷蔵庫へ移して補充する。
//
// 毎晩、閉めるときに冷蔵庫を各3個にそろえ、
// そのとき冷凍庫に何個残っているかを記録する。
// 冷凍庫が各2個を切っていたら、翌日10個仕込む。
//
// 数えるのは夜の1回だけにしてある。朝も数えていたが、
// 夜にそろえてから開けるまでに減らないので意味がなかった。

export const HOTSAND_FLAVORS = ["クラシックメルト", "ガーデンメルト"] as const;
export type Flavor = (typeof HOTSAND_FLAVORS)[number];

/** 閉めるときに冷蔵庫にそろえる数（フレーバーごと） */
export const FRIDGE_PAR = 3;
/** 冷凍庫がフレーバーごとにこれを切ったら、翌日仕込む */
export const FREEZER_LOW = 2;
/** 1回に仕込む数。3日に1回まわってくる想定 */
export const BATCH = 10;

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

/** 仕込んだ記録。何個作って冷凍庫に入れたか */
export type Made = { freezer: Record<string, number>; at: string };

type Day = { night?: Entry; made?: Made };
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
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 冷凍庫が少ないフレーバー */
export function lowFlavors(entry: Entry | undefined): { flavor: string; left: number }[] {
  if (!entry) return [];
  return HOTSAND_FLAVORS.map((f) => ({ flavor: f, left: entry.freezer[f] ?? 0 }))
    .filter((x) => x.left < FREEZER_LOW);
}

export async function dayState(date: string) {
  const all = await getAll();
  const today = all[date] ?? {};
  const yst = all[yesterdayOf(date)] ?? {};

  // 仕込むかどうかは前夜の記録で決まる。
  // ただし今夜もう数えているなら、そちらが最新なのでそれを見る。
  const basis = today.night ?? yst.night;
  const basisDate = today.night ? date : yesterdayOf(date);
  const low = lowFlavors(basis);
  // その日にもう仕込んでいれば、仕込みの作業は出さない
  const madeToday = Object.values(today.made?.freezer ?? {}).reduce((a, b) => a + b, 0);

  return {
    flavors: [...HOTSAND_FLAVORS],
    fridgePar: FRIDGE_PAR,
    freezerLow: FREEZER_LOW,
    batch: BATCH,
    night: {
      counted: !!today.night,
      fridge: today.night?.fridge ?? null,
      freezer: today.night?.freezer ?? null,
      tane: today.night?.tane ?? null,
      low: lowFlavors(today.night),
    },
    /** 仕込みの判断のもとになった記録 */
    basisDate: basis ? basisDate : null,
    low,
    madeToday,
    needPrep: low.length > 0 && madeToday === 0,
  };
}
