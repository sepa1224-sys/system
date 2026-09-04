// 9/22 DJ NIGHT の申込データ（Vercel KV）。
// 夏祭り（lib/natsumatsuri.ts）と同じ作りだが、データは別に持つ。
// 夏祭りの記録を壊さないため、キーもプランも分けてある。

const KEY = "djnight:entries";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export const EVENT_DATE = "2026-09-22";
export const EVENT_LABEL = "9/22（火）";

/** 申込の締切。当日参加もOKなので、あくまで事前申込の目安 */
export const DEADLINE = "2026-09-22T18:00:00+09:00";

export function deadlinePassed(): boolean {
  return Date.now() >= new Date(DEADLINE).getTime();
}

export type Plan = {
  id: string;
  label: string;
  price: number;
  detail: string;
  /** Squareの事前決済リンク */
  payUrl: string;
};

export const PLANS: Plan[] = [
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
];

export function planOf(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export type Entry = {
  id: string;
  name: string;
  /** LINEの表示名。LINE経由の申込で入る */
  lineName?: string;
  lineUserId?: string;
  email?: string;
  planId: string;
  /** 事前に払ったか。当日払いもOK */
  paid: boolean;
  /** 受付で確認した日時。当日ここを押す */
  checkedInAt?: string;
  djRequest?: string;
  photoOk: boolean;
  note?: string;
  createdAt: string;
};

export async function getEntries(): Promise<Entry[]> {
  const store = await kv();
  if (!store) return [];
  const list = (await store.get<Entry[]>(KEY)) ?? [];
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addEntry(e: Entry): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<Entry[]>(KEY)) ?? [];
  list.push(e);
  await store.set(KEY, list);
}

export async function updateEntry(id: string, patch: Partial<Entry>): Promise<Entry | null> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<Entry[]>(KEY)) ?? [];
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id: list[i].id, createdAt: list[i].createdAt };
  await store.set(KEY, list);
  return list[i];
}

export async function deleteEntry(id: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<Entry[]>(KEY)) ?? [];
  await store.set(KEY, list.filter((e) => e.id !== id));
}

/**
 * 売上の見込み。
 * 原価はビール¥249・それ以外¥128、消耗品と決済で9.7%。
 * 飲み放題は6杯、ほろ酔いは3杯（うちビール1杯）で置いている。
 */
const BEER = 249;
const OTHER = 128;
const FEE = 0.097;

function grossOf(planId: string): number {
  const p = planOf(planId);
  if (!p) return 0;
  const cups = planId === "nomihodai" ? 6 : planId === "horoyoi" ? 3 : 1;
  const cost = cups >= 1 ? BEER + OTHER * (cups - 1) : 0;
  return p.price - cost - p.price * FEE;
}

export function summary(entries: Entry[]) {
  const byPlan: Record<string, number> = {};
  let sales = 0;
  let gross = 0;
  let paid = 0;
  for (const e of entries) {
    const p = planOf(e.planId);
    if (!p) continue;
    byPlan[e.planId] = (byPlan[e.planId] ?? 0) + 1;
    sales += p.price;
    gross += grossOf(e.planId);
    if (e.paid) paid += p.price;
  }
  return {
    people: entries.length,
    byPlan,
    sales,
    gross: Math.round(gross),
    paid,
    unpaid: sales - paid,
    checkedIn: entries.filter((e) => e.checkedInAt).length,
  };
}
