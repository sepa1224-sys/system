// Threads自動投稿の「いつ・何を出すか」と、文面の検査。
//
// 保存・AI・APIの呼び出しは lib/threads.ts。ここは計算だけにして、テストで確かめられるようにする。

/** 予定表（/schedule）のうち、ここで使う項目だけ。note・place は公開に使わないので受け取らない */
export type PlanEvent = { id: string; title: string; date: string };

/** 「告知する」の印。date は印を付けたときの日付で、予定が動いたら効かなくなる */
export type Announce = { on: boolean; title: string; line: string; date: string };

export type RunAlways = { on: boolean; line: string };

/** 公開してよい形にしたイベント */
export type PublicEvent = { id: string; date: string; title: string; line: string; isRun: boolean };

export const ROTATION = ["yoru", "hours", "place", "run"] as const;
export type Theme = "before" | "three" | (typeof ROTATION)[number];

export const THEME_LABEL: Record<Theme, string> = {
  before: "イベントの前日",
  three: "イベントの3日前",
  yoru: "夜の居場所",
  hours: "営業時間",
  place: "場所（彦根駅・彦根城の近く）",
  run: "ランクラブの紹介",
};

export const MAX_LENGTH = 500;

export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** 毎週木曜のラン。土曜のランは含めない */
export const isThursdayRun = (e: PlanEvent) => weekday(e.date) === 4 && e.title.trim() === "ランニングクラブ";

// ───────── 文面の検査 ─────────

/** Threadsの字数。絵文字はUTF-8のバイト数で数える */
export function threadsLength(text: string): number {
  let n = 0;
  for (const { segment } of new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text)) {
    n += /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(segment)
      ? new TextEncoder().encode(segment).length
      : [...segment].length;
  }
  return n;
}

const norm = (s: string) => s.normalize("NFKC").replace(/[‐‑–—―−ー]/g, "-");

/** 電話番号かメールアドレスらしいもの */
export function hasContact(text: string): boolean {
  const t = norm(text);
  return (
    /(?:\+81|0)[-\s(]*\d{1,4}[-\s)]*\d{1,4}[-\s]*\d{3,4}/.test(t) ||
    /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(t)
  );
}

function amounts(text: string): string[] {
  const t = norm(text).replace(/(\d),(?=\d)/g, "$1");
  return [...t.matchAll(/[¥]\s*(\d+)|(\d+(?:\.\d+)?万?千?)\s*円/g)].map((m) => m[1] ?? m[2]);
}

/** allowed は公開用の一文。そこに書いてある金額だけは本文に使ってよい */
export function checkText(text: string, allowed: string[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!text.trim()) errors.push("本文が空です");
  const len = threadsLength(text);
  if (len > MAX_LENGTH) errors.push(`${len}字あります（${MAX_LENGTH}字まで）`);
  if (hasContact(text)) warnings.push("電話番号かメールアドレスらしいものがあります");
  const ok = new Set(allowed.flatMap(amounts));
  const bad = amounts(text).filter((a) => !ok.has(a));
  if (bad.length) warnings.push(`公開用の一文に無い金額があります（${bad.join("、")}円）`);
  if (/24時半|24:30|24時30分|(?<!\d)0時半|(?<!\d)0:30/.test(norm(text))) warnings.push("閉店は24時です（24時半と書いてあります）");
  return { errors, warnings };
}

// ───────── 何を出すか ─────────

export function publicEvents(events: PlanEvent[], marks: Record<string, Announce>, runs: RunAlways): PublicEvent[] {
  const out: PublicEvent[] = [];
  for (const e of events) {
    const isRun = isThursdayRun(e);
    const m = marks[e.id];
    if (m?.on && m.date === e.date) {
      out.push({ id: e.id, date: e.date, title: m.title, line: m.line, isRun });
    } else if (isRun && runs.on) {
      out.push({ id: e.id, date: e.date, title: "ランクラブ", line: runs.line, isRun });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

type IsPosting = (date: string) => boolean;

/** date を含めて、さかのぼって最初の投稿日 */
function postingOnOrBefore(date: string, posting: IsPosting): string | null {
  for (let i = 0; i < 14; i++) {
    const d = addDays(date, -i);
    if (posting(d)) return d;
  }
  return null;
}

export function pickTheme(
  date: string,
  pub: PublicEvent[],
  all: PlanEvent[],
  posting: IsPosting,
  lastRotation: string | undefined,
): { theme: Theme; events: PublicEvent[] } {
  const before = pub.filter((e) => e.date > date && postingOnOrBefore(addDays(e.date, -1), posting) === date);
  if (before.length) return { theme: "before", events: before };

  const three = pub.filter((e) => !e.isRun && e.date > date && postingOnOrBefore(addDays(e.date, -3), posting) === date);
  if (three.length) return { theme: "three", events: three };

  // 木曜は当日のランと紛れるので紹介しない。次の木曜が予定に無ければ、休みの週に誘うことになるので飛ばす
  const toThu = (4 - weekday(date) + 7) % 7;
  const runOk = toThu !== 0 && all.some((e) => e.date === addDays(date, toThu) && isThursdayRun(e));
  const start = ROTATION.findIndex((t) => t === lastRotation) + 1;
  for (let i = 0; i < ROTATION.length; i++) {
    const t = ROTATION[(start + i) % ROTATION.length];
    if (t !== "run" || runOk) return { theme: t, events: [] };
  }
  return { theme: "yoru", events: [] };
}

/** 下書きを作ったあとで、載せたイベントが消えた・動いた・告知をやめた・言い方が変わったか */
export function draftStale(used: PublicEvent[], theme: Theme, date: string, pub: PublicEvent[], all: PlanEvent[]): boolean {
  if (theme === "run") {
    const thu = addDays(date, (4 - weekday(date) + 7) % 7);
    return !all.some((e) => e.date === thu && isThursdayRun(e));
  }
  return used.some((u) => {
    const now = pub.find((p) => p.id === u.id);
    return !now || now.date !== u.date || now.title !== u.title || now.line !== u.line;
  });
}

/** 次に出す日。今日の投稿時刻を過ぎていたら明日から探す */
export function nextPostDate(now: { date: string; minutes: number }, timeMin: number, posting: IsPosting): string | null {
  for (let i = now.minutes >= timeMin ? 1 : 0; i < 30; i++) {
    const d = addDays(now.date, i);
    if (posting(d)) return d;
  }
  return null;
}
