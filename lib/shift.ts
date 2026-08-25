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

/** 手で1件足すときの時間帯の雛形。1オペ3交代が基本 */
export const PATTERNS: { label: string; start: string; end: string; staff?: Staff }[] = [
  { label: "朝番", start: "9:00", end: "14:30" },
  { label: "昼番", start: "14:30", end: "19:30" },
  { label: "夜番", start: "19:30", end: "24:30" },
  { label: "土曜昼", start: "9:00", end: "17:00" },
  { label: "土曜夜", start: "17:00", end: "24:00" },
  { label: "バイト", start: "9:00", end: "14:00", staff: "バイト" },
];

export type Block = { staff: Staff; start: string; end: string; note?: string };

/**
 * 曜日ごとの定型シフト。2026-08-25に1オペ3交代へ切り替えた。
 * 朝番9:00-14:30 / 昼番14:30-19:30 / 夜番19:30-24:30。土曜だけ2交代。
 * 今後はシフト提出（/shift-submit）を見て担当を入れ替えていく。
 */
export const WEEKDAY_TEMPLATES: { weekday: number; label: string; blocks: Block[]; note?: string }[] = [
  {
    weekday: 3,
    label: "水曜",
    blocks: [
      { staff: "櫻井", start: "9:00", end: "14:30" },
      { staff: "町田", start: "14:30", end: "19:30" },
      { staff: "坂本", start: "19:30", end: "24:30" },
    ],
  },
  {
    weekday: 4,
    label: "木曜",
    blocks: [
      { staff: "町田", start: "9:00", end: "14:30" },
      { staff: "坂本", start: "14:30", end: "19:30" },
      { staff: "櫻井", start: "19:30", end: "24:30" },
    ],
  },
  {
    weekday: 5,
    label: "金曜",
    blocks: [
      { staff: "町田", start: "9:00", end: "14:30" },
      { staff: "櫻井", start: "14:30", end: "19:30" },
      { staff: "坂本", start: "19:30", end: "24:30" },
    ],
  },
  {
    weekday: 6,
    label: "土曜",
    blocks: [
      { staff: "櫻井", start: "9:00", end: "17:00" },
      { staff: "坂本", start: "17:00", end: "24:00" },
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

/** 開店準備の時間帯。1オペ体制なので朝番1人で回す */
export const PREP_START = 9 * 60;
export const PREP_END = 10 * 60;
export const PREP_REQUIRED = 1;

/** 9:00-10:00 に入っている人数。PREP_REQUIRED を下回っていたら要修正 */
export function prepCount(entries: ShiftEntry[]): number {
  return entries.filter((e) => {
    const s = toMin(e.start);
    let t = toMin(e.end);
    if (s === null || t === null) return false;
    if (t <= s) t += 24 * 60;
    return s <= PREP_START && PREP_END <= t;
  }).length;
}

export type Segment = { start: string; end: string; staff: string[]; idle: boolean };

/**
 * 「9:00-10:00 櫻井・町田」「10:00-14:00 櫻井」のような時間帯ごとの担当リストを作る。
 * 30分刻みで見て、担当の顔ぶれが変わらない限り1本にまとめる。
 * 誰が何時に入るかを、シフト表と同じ書き方で確認するためのもの。
 */
export function segments(entries: ShiftEntry[]): Segment[] {
  if (!entries.length) return [];
  const starts = entries.map((e) => toMin(e.start) ?? 0);
  const ends = entries.map((e) => {
    const s = toMin(e.start) ?? 0;
    let t = toMin(e.end) ?? 0;
    if (t <= s) t += 24 * 60;
    return t;
  });
  const from = Math.min(...starts);
  const to = Math.max(...ends);

  const at = (m: number) =>
    entries
      .filter((_, i) => starts[i] <= m && m < ends[i])
      .map((e) => e.staff)
      .sort();

  const out: Segment[] = [];
  let cur: string[] | null = null;
  let curFrom = from;
  for (let m = from; m < to; m += 30) {
    const now = at(m);
    const key = now.join("|");
    if (cur === null) {
      cur = now;
      curFrom = m;
    } else if (key !== cur.join("|")) {
      out.push({ start: fromMin(curFrom), end: fromMin(m), staff: cur, idle: cur.length === 0 });
      cur = now;
      curFrom = m;
    }
  }
  if (cur !== null) {
    out.push({ start: fromMin(curFrom), end: fromMin(to), staff: cur, idle: cur.length === 0 });
  }
  return out;
}

export type DaySummary = {
  date: string;
  entries: ShiftEntry[];
  totalMinutes: number;
  gaps: string[];
  /** 2人以上いる時間帯の長さ（分）。売上ピークを覆えているかの目安 */
  doubleMinutes: number;
  /** 開店準備の人数と、2人に足りているか */
  prepCount: number;
  prepOk: boolean;
  /** 時間帯ごとの担当（シフト表と同じ書き方） */
  segments: Segment[];
};

export function summarizeDay(date: string, entries: ShiftEntry[]): DaySummary {
  const slots = coverage(entries);
  const prep = prepCount(entries);
  return {
    date,
    entries,
    totalMinutes: entries.reduce((n, e) => n + entryMinutes(e), 0),
    gaps: gaps(entries),
    doubleMinutes: slots.filter((s) => s.count >= 2).length * 30,
    prepCount: prep,
    prepOk: prep >= PREP_REQUIRED,
    segments: segments(entries),
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
