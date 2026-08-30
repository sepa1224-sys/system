// 店舗スケジュール。イベントに出店する日と、店でやるイベントの日をまとめて持つ。
// 「いつ何があるか」を一目で見るのが目的なので、時刻ではなく日付単位で扱う。

const KEY = "schedule:events";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** 出店＝よそのイベントに出る / 店舗＝flat.でやる */
export type Kind = "出店" | "店舗";

export type EventItem = {
  id: string;
  title: string;
  kind: Kind;
  /** YYYY-MM-DD */
  date: string;
  /** 複数日にまたがるとき。単日なら省略 */
  endDate?: string;
  place?: string;
  note?: string;
};

/**
 * 決まっているイベント。ここに書いたものが初期表示になる。
 * 画面から足した分は KV に入り、こちらと合わせて表示する。
 */
export const SEED_EVENTS: EventItem[] = [
  {
    id: "natsumatsuri-2026",
    title: "flat. 夏祭り2026",
    kind: "店舗",
    date: "2026-08-22",
    place: "flat.（1F・2F）",
    note: "盆踊りパーティ／花火。2Fはポップアップ出店",
  },
  {
    id: "game-night-0921",
    title: "ゲームナイト",
    kind: "店舗",
    date: "2026-09-21",
    place: "flat.",
  },
  {
    id: "shigadai-gakusai-2026",
    title: "滋賀大学 学祭",
    kind: "出店",
    date: "2026-10-24",
    endDate: "2026-10-25",
    place: "滋賀大学",
  },
  {
    id: "hikone-city-marathon-39",
    title: "第39回 彦根シティマラソン",
    kind: "出店",
    date: "2026-11-08",
    place: "彦根市",
    note: "協賛金6,000円（4m×6m）／カセットコンロ使用",
  },
];

export function todayJST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function getAdded(): Promise<EventItem[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<EventItem[]>(KEY)) ?? [];
}

async function saveAdded(list: EventItem[]) {
  const store = await kv();
  if (store) await store.set(KEY, list);
}

/** 画面から足した分を含めた全イベント。同じidなら足した方を優先する */
export async function getEvents(): Promise<EventItem[]> {
  const added = await getAdded();
  const map = new Map<string, EventItem>();
  for (const e of SEED_EVENTS) map.set(e.id, e);
  for (const e of added) map.set(e.id, e);
  return [...map.values()]
    .filter((e) => e.title && e.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function upsertEvent(e: EventItem) {
  const added = await getAdded();
  const i = added.findIndex((x) => x.id === e.id);
  if (i >= 0) added[i] = e;
  else added.push(e);
  await saveAdded(added);
}

/** SEED_EVENTS のものは消せない（コードに書いてあるので復活する） */
export async function removeEvent(id: string): Promise<boolean> {
  const added = await getAdded();
  const next = added.filter((x) => x.id !== id);
  await saveAdded(next);
  return next.length !== added.length;
}

/** その日を含む全日付。複数日イベントをカレンダーに敷くのに使う */
export function daysOf(e: EventItem): string[] {
  const out = [e.date];
  if (!e.endDate || e.endDate <= e.date) return out;
  const d = new Date(`${e.date}T00:00:00Z`);
  const end = new Date(`${e.endDate}T00:00:00Z`);
  while (true) {
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.toISOString().slice(0, 10);
    if (s > e.endDate || d > end) break;
    out.push(s);
  }
  return out;
}

/** 今日からの残り日数。過ぎていたらマイナス */
export function daysUntil(date: string, today = todayJST()): number {
  const a = Date.parse(`${date}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.round((a - b) / 86400000);
}
