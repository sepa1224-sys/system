// ホットサンドの仕込み在庫。
//
// 朝と夕方に、冷蔵庫と冷凍庫にそれぞれ何個あるかを数える。
// 決めた数に足りなければ、その差だけ仕込む。
// 「何個あったか」と「何個仕込んだか」を両方残すので、
// 1日に何個出ているかが後から分かる。

export const HOTSAND_FLAVORS = ["クラシックメルト", "ガーデンメルト"] as const;
export type Flavor = (typeof HOTSAND_FLAVORS)[number];

/** 常に置いておく数。フレーバーごとの個数 */
export const HOTSAND_PAR = { fridge: 3, freezer: 5 } as const;

/** 朝の分か、夕方の分か */
export type Slot = "morning" | "evening";

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
  /** フレーバーごとの冷蔵庫の個数 */
  fridge: Record<string, number>;
  /** フレーバーごとの冷凍庫の個数 */
  freezer: Record<string, number>;
  /** ホットサンドのタネが仕込んであるか */
  tane: boolean;
  /** このあと仕込んだ数。冷蔵用と冷凍用で分ける */
  made?: { fridge: Record<string, number>; freezer: Record<string, number> };
  at: string;
};

type Day = Partial<Record<Slot, Entry>>;
type Store = Record<string, Day>;

export async function getAll(): Promise<Store> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Store>(KEY)) ?? {};
}

async function put(all: Store): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  // 1年分。1日2件しかないので軽い
  const keep = Object.keys(all).sort().slice(-365);
  const next: Store = {};
  for (const d of keep) next[d] = all[d];
  await store.set(KEY, next);
}

const zero = () => Object.fromEntries(HOTSAND_FLAVORS.map((f) => [f, 0]));

/** 数えた結果を記録する */
export async function saveCount(
  date: string,
  slot: Slot,
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
    ...(day[slot]?.made ? { made: day[slot]!.made } : {}),
    at: new Date().toISOString(),
  };
  day[slot] = entry;
  all[date] = day;
  await put(all);
  return entry;
}

/**
 * 仕込んだ数を記録する。数えた数にそのまま足す。
 * 仕込んだ直後にもう一度数え直さなくて済むようにするため。
 */
export async function saveMade(
  date: string,
  slot: Slot,
  fridge: Record<string, number>,
  freezer: Record<string, number>,
): Promise<Entry> {
  const all = await getAll();
  const day = all[date] ?? {};
  const cur = day[slot];
  if (!cur) throw new Error("先に個数を数えて記録してください");
  const add = (base: Record<string, number>, plus: Record<string, number>) =>
    Object.fromEntries(
      HOTSAND_FLAVORS.map((f) => [f, (base[f] ?? 0) + (Number(plus[f]) || 0)]),
    );
  const madeF = Object.fromEntries(HOTSAND_FLAVORS.map((f) => [f, Number(fridge[f]) || 0]));
  const madeZ = Object.fromEntries(HOTSAND_FLAVORS.map((f) => [f, Number(freezer[f]) || 0]));
  const prev = cur.made ?? { fridge: zero(), freezer: zero() };
  const entry: Entry = {
    ...cur,
    fridge: add(cur.fridge, madeF),
    freezer: add(cur.freezer, madeZ),
    made: { fridge: add(prev.fridge, madeF), freezer: add(prev.freezer, madeZ) },
    at: new Date().toISOString(),
  };
  day[slot] = entry;
  all[date] = day;
  await put(all);
  return entry;
}

export type Shortage = { flavor: string; fridge: number; freezer: number };

/** 決めた数に対して、何個足りないか */
export function shortages(entry: Entry | undefined): Shortage[] {
  if (!entry) return [];
  return HOTSAND_FLAVORS.map((f) => ({
    flavor: f,
    fridge: Math.max(0, HOTSAND_PAR.fridge - (entry.fridge[f] ?? 0)),
    freezer: Math.max(0, HOTSAND_PAR.freezer - (entry.freezer[f] ?? 0)),
  })).filter((s) => s.fridge > 0 || s.freezer > 0);
}

/** その日の状態。朝と夕方それぞれの、数えた結果と不足 */
export async function dayState(date: string) {
  const all = await getAll();
  const day = all[date] ?? {};
  const build = (slot: Slot) => {
    const e = day[slot];
    const short = shortages(e);
    return {
      counted: !!e,
      fridge: e?.fridge ?? null,
      freezer: e?.freezer ?? null,
      tane: e?.tane ?? null,
      made: e?.made ?? null,
      shortages: short,
      /** 足りないので仕込みが要る */
      needPrep: short.length > 0,
    };
  };
  return {
    flavors: [...HOTSAND_FLAVORS],
    par: HOTSAND_PAR,
    morning: build("morning"),
    evening: build("evening"),
  };
}
