// 勤怠記録のストレージ（Vercel KV）。
// これまでの LINE → GAS → Googleスプレッドシート の代わりに、
// LIFF/このアプリから直接ここに書き込む。労働枠(/labor)もここを読む。

import { mapName, type Member } from "@/lib/labor";

const KEY = "kintai:records";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type KintaiRecord = {
  id: string;
  date: string; // 出勤日 YYYY-MM-DD（日跨ぎ退勤でも出勤した日）
  name: string; // 入力時の表示名（LINE名など）
  member: Member | null; // 役員名にマップした結果
  clockIn: string; // "H:MM" 24時間表記
  clockOut: string; // "H:MM"。未退勤は ""（1:57 のような日跨ぎは翌日の時刻）
  breakMin: number; // 休憩（分）
  note?: string; // 成果物・メモ
  source: string; // sheet-import / liff / manual / backfill / ai
  updatedAt: string;
};

export function newId(): string {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getKintai(): Promise<KintaiRecord[]> {
  const store = await kv();
  if (!store) return [];
  const list = (await store.get<KintaiRecord[]>(KEY)) ?? [];
  return list.sort((a, b) =>
    a.date === b.date ? a.clockIn.localeCompare(b.clockIn) : a.date < b.date ? -1 : 1,
  );
}

/** idで上書き、無ければ追加 */
export async function upsertKintai(records: KintaiRecord[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<KintaiRecord[]>(KEY)) ?? [];
  for (const r of records) {
    const i = list.findIndex((x) => x.id === r.id);
    if (i >= 0) list[i] = r;
    else list.push(r);
  }
  await store.set(KEY, list);
}

export async function deleteKintai(ids: string[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<KintaiRecord[]>(KEY)) ?? [];
  await store.set(KEY, list.filter((r) => !ids.includes(r.id)));
}

/** "14:00" → 分。不正は null */
export function hmToMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** 1件の実働時間（h）。退勤未入力なら null。日跨ぎ対応。 */
export function recordHours(r: KintaiRecord): number | null {
  const a = hmToMin(r.clockIn);
  const b = hmToMin(r.clockOut);
  if (a === null || b === null) return null;
  let diff = b - a;
  if (diff <= 0) diff += 24 * 60;
  const work = (diff - (r.breakMin || 0)) / 60;
  if (!isFinite(work) || work <= 0) return null;
  return Math.round(work * 10) / 10;
}

/** computeHours() が食べられる行形式 [日付,名前,出勤,退勤,休憩] に変換 */
export function toRows(records: KintaiRecord[]): (string | number)[][] {
  return records.map((r) => [r.date, r.name, r.clockIn, r.clockOut, r.breakMin]);
}

/** 生の行（シートやAIの出力）をレコード化 */
export function makeRecord(input: {
  date: string;
  name: string;
  clockIn: string;
  clockOut?: string;
  breakMin?: number;
  note?: string;
  source: string;
  id?: string;
}): KintaiRecord {
  return {
    id: input.id || newId(),
    date: input.date,
    name: input.name,
    member: mapName(input.name),
    clockIn: input.clockIn,
    clockOut: input.clockOut ?? "",
    breakMin: Number(input.breakMin) || 0,
    note: input.note || "",
    source: input.source,
    updatedAt: new Date().toISOString(),
  };
}
