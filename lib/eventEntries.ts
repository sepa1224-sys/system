// イベント申込のデータ（Vercel KV）。
// どのイベントかは slug で決まり、内容と保存先は lib/events.ts の登録簿から引く。
// 夏祭り（lib/natsumatsuri.ts）とは別物。夏祭りの記録は壊さない。

import { eventOf, type FlatEvent, type EventPlan } from "@/lib/events";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export function deadlinePassed(ev: FlatEvent): boolean {
  return Date.now() >= new Date(ev.deadline).getTime();
}

export function planOf(ev: FlatEvent, id: string): EventPlan | undefined {
  return ev.plans.find((p) => p.id === id);
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

export async function getEntries(slug: string): Promise<Entry[]> {
  const ev = eventOf(slug);
  const store = await kv();
  if (!ev || !store) return [];
  const list = (await store.get<Entry[]>(ev.kvKey)) ?? [];
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addEntry(slug: string, e: Entry): Promise<void> {
  const ev = eventOf(slug);
  const store = await kv();
  if (!ev) throw new Error("知らないイベントです");
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<Entry[]>(ev.kvKey)) ?? [];
  list.push(e);
  await store.set(ev.kvKey, list);
}

export async function updateEntry(
  slug: string,
  id: string,
  patch: Partial<Entry>,
): Promise<Entry | null> {
  const ev = eventOf(slug);
  const store = await kv();
  if (!ev || !store) throw new Error("保存できません");
  const list = (await store.get<Entry[]>(ev.kvKey)) ?? [];
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id: list[i].id, createdAt: list[i].createdAt };
  await store.set(ev.kvKey, list);
  return list[i];
}

export async function deleteEntry(slug: string, id: string): Promise<void> {
  const ev = eventOf(slug);
  const store = await kv();
  if (!ev || !store) throw new Error("保存できません");
  const list = (await store.get<Entry[]>(ev.kvKey)) ?? [];
  await store.set(ev.kvKey, list.filter((e) => e.id !== id));
}

/**
 * 売上の見込み。
 * 原価はビール¥249・それ以外¥128、消耗品と決済で9.7%。
 * 飲み放題は6杯、3杯プランは3杯（うちビール1杯）で置いている。
 */
const BEER = 249;
const OTHER = 128;
const FEE = 0.097;

function cupsOf(planId: string): number {
  if (planId.includes("nomihodai")) return 6;
  if (planId.includes("horoyoi")) return 3;
  return 1;
}

export function summary(ev: FlatEvent, entries: Entry[]) {
  const byPlan: Record<string, number> = {};
  let sales = 0;
  let gross = 0;
  let paid = 0;
  for (const e of entries) {
    const p = planOf(ev, e.planId);
    if (!p) continue;
    byPlan[e.planId] = (byPlan[e.planId] ?? 0) + 1;
    sales += p.price;
    const cups = cupsOf(e.planId);
    const cost = BEER + OTHER * (cups - 1);
    gross += p.price - cost - p.price * FEE;
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
