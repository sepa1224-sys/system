// シフト表のストレージ（Vercel KV）。
// 勤怠(/kintai)が「実際に働いた記録」なのに対して、こちらは「これから誰がいつ入るか」の予定。
// 営業時間に穴が空いていないか、その日が何人体制になるかを自動で出す。

const KEY = "shift:entries";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** シフトに入る人。役員3名＋アルバイト枠。労働枠(/labor)のMEMBERSとは別管理 */
export const STAFF = ["坂本", "町田", "櫻井", "バイト"] as const;
export type Staff = (typeof STAFF)[number];

/** 営業時間。カバレッジの穴はこの範囲で判定する */
export const OPEN_MIN = 10 * 60; // 10:00
export const CLOSE_MIN = 24 * 60 + 30; // 24:30（翌0:30）

/** 手で1件足すときの時間帯の雛形 */
export const PATTERNS: { label: string; start: string; end: string; staff?: Staff }[] = [
  { label: "早番", start: "9:00", end: "14:00" },
  { label: "中番", start: "14:00", end: "18:00" },
  { label: "遅番", start: "19:00", end: "22:30" },
  { label: "閉め", start: "20:00", end: "24:30" },
  { label: "バイト", start: "10:00", end: "14:00", staff: "バイト" },
];

export type Block = { staff: Staff; start: string; end: string; note?: string };

/**
 * 曜日ごとの定型シフト。ここを直すと以降の割当がすべて変わる。
 *
 * 元の指定は「15:00-18:00は14:00-15:00に入っている方がそのまま続ける」という
 * 条件付きだったので、火曜=坂本・水曜=町田 に解決したうえで連続する枠を
 * 1本にまとめてある（14:00-15:00 と 15:00-18:00 → 14:00-18:00）。
 *
 * 火曜と水曜は坂本と町田が入れ替わっているだけで、櫻井は両日とも同じ。
 */
export const WEEKDAY_TEMPLATES: { weekday: number; label: string; blocks: Block[]; note?: string }[] = [
  {
    weekday: 2,
    label: "火曜",
    blocks: [
      { staff: "櫻井", start: "9:00", end: "14:00" },
      { staff: "櫻井", start: "15:00", end: "18:00" },
      { staff: "坂本", start: "14:00", end: "18:00" },
      { staff: "坂本", start: "19:00", end: "24:30" },
      { staff: "町田", start: "9:00", end: "10:00" },
      { staff: "町田", start: "20:00", end: "22:30" },
    ],
  },
  {
    weekday: 3,
    label: "水曜",
    blocks: [
      { staff: "櫻井", start: "9:00", end: "14:00" },
      { staff: "櫻井", start: "15:00", end: "18:00" },
      { staff: "町田", start: "14:00", end: "18:00" },
      { staff: "町田", start: "20:00", end: "24:30" },
      { staff: "坂本", start: "9:00", end: "10:00" },
      { staff: "坂本", start: "19:00", end: "22:30" },
    ],
  },
  {
    weekday: 4,
    label: "木曜",
    blocks: [
      { staff: "櫻井", start: "9:00", end: "14:00" },
      { staff: "櫻井", start: "15:00", end: "18:00" },
      { staff: "町田", start: "14:00", end: "18:00" },
      { staff: "町田", start: "20:00", end: "24:30" },
      { staff: "坂本", start: "9:00", end: "10:00" },
      { staff: "坂本", start: "19:00", end: "22:30" },
    ],
  },
  {
    weekday: 5,
    label: "金曜",
    // 金曜だけ 9:00-10:00 が坂本1人（他の曜日は2人で仕込み）。櫻井は10:00入り。
    blocks: [
      { staff: "坂本", start: "9:00", end: "10:00" },
      { staff: "坂本", start: "19:00", end: "24:30" },
      { staff: "櫻井", start: "10:00", end: "14:00" },
      { staff: "櫻井", start: "15:00", end: "18:00" },
      { staff: "町田", start: "14:00", end: "18:00" },
      { staff: "町田", start: "20:00", end: "22:30" },
    ],
  },
  {
    weekday: 6,
    label: "土曜",
    // 15:00以降は「全員でイベント準備」。終了時刻が未確定なので枠を入れていない。
    // 決まったらここに全員分のブロックを足す。
    note: "15:00以降は全員でイベント準備（終了時刻が未確定）",
    blocks: [
      { staff: "町田", start: "9:00", end: "10:00" },
      { staff: "櫻井", start: "10:00", end: "14:00" },
      { staff: "町田", start: "14:00", end: "15:00" },
    ],
  },
];

export const templateFor = (weekday: number) =>
  WEEKDAY_TEMPLATES.find((t) => t.weekday === weekday) ?? null;

/** 月内の該当曜日すべてにテンプレートを展開する。既存の割当がある日は触らない */
export function expandMonth(month: string, existing: ShiftEntry[]): ShiftEntry[] {
  const taken = new Set(existing.map((e) => e.date));
  const out: ShiftEntry[] = [];
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    if (taken.has(date)) continue;
    const tpl = templateFor(new Date(`${date}T00:00:00Z`).getUTCDay());
    if (!tpl) continue;
    for (const b of tpl.blocks) {
      out.push({
        id: newId(),
        date,
        staff: b.staff,
        start: b.start,
        end: b.end,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return out;
}

export type ShiftEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  staff: string;
  start: string; // "H:MM"
  end: string; // "H:MM"。24:30 のように24時を超える表記も可
  note?: string;
  updatedAt: string;
};

export function newId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** "H:MM" → 0時からの分。"24:30" は 1470 として扱う（日跨ぎ表記をそのまま使えるように） */
export function toMin(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (mi > 59) return null;
  return h * 60 + mi;
}

export function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  return `${h}:${String(min % 60).padStart(2, "0")}`;
}

/** 拘束時間（分）。終了が開始より前なら日跨ぎとみなして24時間足す */
export function entryMinutes(e: Pick<ShiftEntry, "start" | "end">): number {
  const s = toMin(e.start);
  let t = toMin(e.end);
  if (s === null || t === null) return 0;
  if (t <= s) t += 24 * 60;
  return t - s;
}

export async function getShifts(): Promise<ShiftEntry[]> {
  const store = await kv();
  if (!store) return [];
  const list = (await store.get<ShiftEntry[]>(KEY)) ?? [];
  return list.sort((a, b) =>
    a.date === b.date ? entryStart(a) - entryStart(b) : a.date < b.date ? -1 : 1,
  );
}

const entryStart = (e: ShiftEntry) => toMin(e.start) ?? 0;

/** idで上書き、無ければ追加 */
export async function upsertShifts(entries: ShiftEntry[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<ShiftEntry[]>(KEY)) ?? [];
  for (const e of entries) {
    const i = list.findIndex((x) => x.id === e.id);
    if (i >= 0) list[i] = e;
    else list.push(e);
  }
  await store.set(KEY, list);
}

export async function deleteShifts(ids: string[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<ShiftEntry[]>(KEY)) ?? [];
  await store.set(
    KEY,
    list.filter((x) => !ids.includes(x.id)),
  );
}

export type Slot = { min: number; count: number; staff: string[] };

/**
 * その日の30分刻みの配置人数。営業時間(10:00〜24:30)だけを見る。
 * 開店前の仕込み(9:00〜)は人数には数えるが、穴の判定対象にはしない。
 */
export function coverage(entries: ShiftEntry[]): Slot[] {
  const slots: Slot[] = [];
  for (let m = OPEN_MIN; m < CLOSE_MIN; m += 30) {
    const staff = entries
      .filter((e) => {
        const s = toMin(e.start);
        let t = toMin(e.end);
        if (s === null || t === null) return false;
        if (t <= s) t += 24 * 60;
        return s <= m && m < t;
      })
      .map((e) => e.staff);
    slots.push({ min: m, count: staff.length, staff });
  }
  return slots;
}

/**
 * 意図的に誰も入れない時間帯。18:00-19:00 は客足が落ちる（実績で1日平均¥531）ので
 * アイドリングとして空けている。穴の警告からは除外する。
 */
export const IDLE_WINDOWS: { start: string; end: string; label: string }[] = [
  { start: "18:00", end: "19:00", label: "アイドリング" },
];

export function inIdle(min: number): boolean {
  return IDLE_WINDOWS.some((w) => {
    const s = toMin(w.start);
    const e = toMin(w.end);
    return s !== null && e !== null && s <= min && min < e;
  });
}

/** 想定外に誰も入っていない時間帯を "H:MM〜H:MM" でまとめて返す（アイドリングは除く） */
export function gaps(entries: ShiftEntry[]): string[] {
  const out: string[] = [];
  let from: number | null = null;
  for (const s of coverage(entries)) {
    const isGap = s.count === 0 && !inIdle(s.min);
    if (isGap && from === null) from = s.min;
    if (!isGap && from !== null) {
      out.push(`${fromMin(from)}〜${fromMin(s.min)}`);
      from = null;
    }
  }
  if (from !== null) out.push(`${fromMin(from)}〜${fromMin(CLOSE_MIN)}`);
  return out;
}

export type DaySummary = {
  date: string;
  entries: ShiftEntry[];
  totalMinutes: number;
  gaps: string[];
  /** 2人以上いる時間帯の長さ（分）。売上ピークを覆えているかの目安 */
  doubleMinutes: number;
};

export function summarizeDay(date: string, entries: ShiftEntry[]): DaySummary {
  const slots = coverage(entries);
  return {
    date,
    entries,
    totalMinutes: entries.reduce((n, e) => n + entryMinutes(e), 0),
    gaps: gaps(entries),
    doubleMinutes: slots.filter((s) => s.count >= 2).length * 30,
  };
}

/** メンバー別の月間合計（人時）。バイトだけ時給がかかるので分けて集計できるようにしておく */
export function totalsByStaff(entries: ShiftEntry[]): Record<string, { minutes: number; days: number }> {
  const out: Record<string, { minutes: number; days: number }> = {};
  const seen = new Set<string>();
  for (const e of entries) {
    out[e.staff] = out[e.staff] || { minutes: 0, days: 0 };
    out[e.staff].minutes += entryMinutes(e);
    const k = `${e.staff}|${e.date}`;
    if (!seen.has(k)) {
      seen.add(k);
      out[e.staff].days += 1;
    }
  }
  return out;
}
