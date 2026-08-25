// シフトの希望提出。毎週水曜までに、翌週どこで働けるかを各自が出す。
// 「朝番だけ」ではなく働ける時間をそのまま出してもらい、
// 組むときに3交代（朝9:00-14:30/昼14:30-19:30/夜19:30-24:30）へ当てはめる。

const KEY = "shift:requests";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Slot = {
  /** 0=日 〜 6=土 */
  weekday: number;
  start: string; // "H:MM"
  end: string;   // "H:MM"。24:30のような表記も可
};

export type Submission = {
  staff: string;
  /** 対象週の月曜日 YYYY-MM-DD */
  week: string;
  slots: Slot[];
  submittedAt: string;
};

/** week(月曜) → staff → 提出内容 */
type Store = Record<string, Record<string, Submission>>;

export function todayJST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** その日を含む週の月曜日 */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = d.getUTCDay(); // 0=日
  d.setUTCDate(d.getUTCDate() - ((wd + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** 提出の既定対象。水曜までに「翌週」を出す運用なので、常に来週を返す */
export function nextWeekMonday(): string {
  const m = new Date(`${mondayOf(todayJST())}T00:00:00Z`);
  m.setUTCDate(m.getUTCDate() + 7);
  return m.toISOString().slice(0, 10);
}

export function dateOfWeekday(weekMonday: string, weekday: number): string {
  const d = new Date(`${weekMonday}T00:00:00Z`);
  // 月曜起点で 月火水木金土日 の順に並べる
  const offset = (weekday + 6) % 7;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function load(): Promise<Store> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Store>(KEY)) ?? {};
}

export async function getWeek(week: string): Promise<Record<string, Submission>> {
  return (await load())[week] ?? {};
}

export async function submit(sub: Submission): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await load();
  (all[sub.week] = all[sub.week] ?? {})[sub.staff] = sub;
  // 古い週は12週分だけ残す
  const keep = Object.keys(all).sort().slice(-12);
  const next: Store = {};
  for (const w of keep) next[w] = all[w];
  await store.set(KEY, next);
}
