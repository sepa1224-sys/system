// ホットサンドの仕込み在庫。
//
// 回し方は「出したら冷凍庫から冷蔵庫へ補充する」。
// 冷蔵庫はすぐ焼ける分の置き場なので少なくてよく、
// 冷凍庫が本体の在庫になる。
//
//   冷蔵庫が足りない → 冷凍庫から移すだけ（仕込みではない）
//   冷凍庫が足りない → 仕込む
//   冷凍庫が空       → 移すものが無くなるので最優先で仕込む
//
// 朝と夕方に数え、「何個あったか」と「何個仕込んだか」を両方残すので、
// 1日に何個出ているかが後から分かる。

export const HOTSAND_FLAVORS = ["クラシックメルト", "ガーデンメルト"] as const;
export type Flavor = (typeof HOTSAND_FLAVORS)[number];

/** 朝の分か、夜20時の分か */
export type Slot = "morning" | "evening";

/**
 * 置いておく数。時間帯で変える。
 *
 * 朝は冷凍庫を厚くしておく。日中は出るたびに冷凍庫から移せば足りる。
 * 20時は夜の混む時間の前なので、すぐ焼ける冷蔵庫のほうを厚くする。
 * この時間に凍ったものを移しても解凍が間に合わないため、
 * 足りなければ移すのではなく仕込む。
 */
export const HOTSAND_PAR: Record<Slot, { fridge: number; freezer: number }> = {
  morning: { fridge: 2, freezer: 5 },
  evening: { fridge: 3, freezer: 3 },
};

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

export type Shortage = {
  flavor: string;
  /** 冷蔵庫に足りない数。冷凍庫から移して埋める */
  fridge: number;
  /** 冷凍庫に足りない数。仕込んで埋める */
  freezer: number;
  /** 冷凍庫が空。移すものが無いので最優先 */
  freezerEmpty: boolean;
  /** 冷蔵庫が足りないが、冷凍庫から移せば埋まる */
  canMove: boolean;
};

/** 決めた数に対して、何個足りないか */
export function shortages(entry: Entry | undefined, slot: Slot): Shortage[] {
  if (!entry) return [];
  const par = HOTSAND_PAR[slot];
  return HOTSAND_FLAVORS.map((f) => {
    const inF = entry.fridge[f] ?? 0;
    const inZ = entry.freezer[f] ?? 0;
    const fridge = Math.max(0, par.fridge - inF);
    return {
      flavor: f,
      fridge,
      freezer: Math.max(0, par.freezer - inZ),
      freezerEmpty: inZ === 0,
      // 20時は解凍が間に合わないので移さない
      canMove: slot === "morning" && fridge > 0 && inZ > 0,
    };
  }).filter((s) => s.fridge > 0 || s.freezer > 0);
}

/** その日の状態。朝と夕方それぞれの、数えた結果と不足 */
export async function dayState(date: string) {
  const all = await getAll();
  const day = all[date] ?? {};

  const build = (slot: Slot) => {
    const e = day[slot];
    const short = shortages(e, slot);
    return {
      counted: !!e,
      par: HOTSAND_PAR[slot],
      fridge: e?.fridge ?? null,
      freezer: e?.freezer ?? null,
      tane: e?.tane ?? null,
      made: e?.made ?? null,
      shortages: short,
      /** 仕込みが要る。朝は冷凍庫の不足だけ、20時は冷蔵庫の不足も仕込む */
      needPrep:
        slot === "morning"
          ? short.some((s) => s.freezer > 0)
          : short.some((s) => s.freezer > 0 || s.fridge > 0),
      /** 冷蔵庫が足りないので冷凍庫から移す（朝だけ） */
      needMove: short.some((s) => s.canMove),
      /** 冷凍庫が空。これが一番まずい */
      empty: short.filter((s) => s.freezerEmpty).map((s) => s.flavor),
    };
  };
  return {
    flavors: [...HOTSAND_FLAVORS],
    morning: build("morning"),
    evening: build("evening"),
  };
}
