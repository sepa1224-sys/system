// Threads自動投稿。保存（KV）・AIの文面づくり・Threads APIの呼び出し。
//
// 2026-11-25 坂本さんの決めたこと：文面は毎回AIが書く。前日に下書きを作り、何もしなければ出す。
//
// - 「いつ何を出すか」と文面の検査は lib/threadsPlan.ts
// - 5分おきの cron（/api/cron/threads）が tick() を呼ぶ
// - 予定表の note・place には貸切のお客様の連絡先や金額が入っている。AIにも投稿にも渡さない

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { isBusinessDay, jstNow, LATE_LIMIT_MIN, toMin } from "@/lib/instagramPlan";
import { listClosures } from "@/lib/instagram";
import { getEvents } from "@/lib/schedule";
import { SHOP } from "@/lib/shop";
import {
  addDays,
  checkText,
  draftStale,
  isThursdayRun,
  markFits,
  nextPostDate,
  pickTheme,
  publicEvents,
  ROTATION,
  THEME_LABEL,
  type Announce,
  type PlanEvent,
  type PublicEvent,
  type RunAlways,
  type Theme,
} from "@/lib/threadsPlan";

const HOST = "https://graph.threads.com";
const DAY = 86400_000;
/** 前日のこの時刻から下書きを作る */
const DRAFT_AT = 22 * 60;
/** 投稿のこの分前までなら、変わったイベントの下書きを作り直す */
const REBUILD_LIMIT = 15;

export type Settings = {
  on: boolean;
  time: string;
  memo: string;
  nightLine: string;
  /** ランの説明。ランを書く日だけAIに渡す（休みの週に誘わないように） */
  runMemo: string;
  runAlways: RunAlways;
  /** 「AIで作成」の印を付ける */
  aiLabel: boolean;
  /** 自動投稿をオンにした・時刻を変えた時。それより前の時刻の分は出さない */
  armedAt: number;
};

export const DEFAULT_SETTINGS: Settings = {
  on: false,
  time: "19:00",
  memo: [
    "彦根駅・彦根城の近くにあるカフェ＆バー。",
    "夜の居場所を探している人に来てほしい。",
  ].join("\n"),
  nightLine: "夜は19時から24時まで（ラストオーダー23:30）",
  runMemo: "毎週木曜、19:50 flat.集合・20:00スタート。約30分、キロ5分〜5分30秒、話しながら走れるペース。参加はインスタ @flat.hikone のDMで。走った後は flat. で休憩（注文しなくてもいい）。",
  runAlways: { on: false, line: "19:50 flat.集合、20:00スタート。約30分、話しながら走れるペース。参加はインスタのDMで。" },
  aiLabel: true,
  armedAt: 0,
};

export type Draft = {
  date: string;
  theme: Theme;
  events: PublicEvent[];
  text: string;
  /** hold＝検査に引っかかったので、人が確かめるまで出さない */
  status: "ready" | "hold";
  /** 確かめてほしいこと、作り直した理由など */
  note?: string;
  edited?: boolean;
  createdAt: string;
};

export type Run = {
  date: string;
  time: string;
  at: string;
  status: "posted" | "skipped" | "error" | "check";
  theme?: Theme;
  text?: string;
  url?: string;
  detail?: string;
};

type Conn = {
  token: string;
  userId: string;
  username: string;
  expiresAt: number;
  refreshedAt: string;
  lastError?: string;
};

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("KV未設定");
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

const draftKey = (date: string) => `th:draft:${date}`;
const lockKey = (date: string) => `th:lock:${date}`;
const STARTED = "この日の投稿はもう始まっています";
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ───────── 保存 ─────────

export async function getSettings(): Promise<Settings> {
  const s = { ...DEFAULT_SETTINGS, ...((await (await kv()).hgetall<Partial<Settings>>("th:settings")) ?? {}) };
  return { ...s, on: s.on === true, time: String(s.time), memo: String(s.memo), nightLine: String(s.nightLine), runMemo: String(s.runMemo) };
}

/** 項目ごとに書く。2台で同時に保存しても、触っていない項目は戻らない */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const next = { ...patch };
  if (next.on || next.time) next.armedAt = Date.now();
  if (Object.keys(next).length) await (await kv()).hset("th:settings", next);
}

export async function listSkips(): Promise<string[]> {
  return ((await (await kv()).smembers<string[]>("th:skip")) ?? []).map(String).sort();
}

export async function setSkip(date: string, skip: boolean): Promise<void> {
  const store = await kv();
  if (skip) await store.sadd("th:skip", date);
  else await store.srem("th:skip", date);
}

// 「この日は出さない」は下書きと別に持つ。下書きが作り直されても消えないように
const stopKey = (date: string) => `th:stop:${date}`;

export async function isStopped(date: string): Promise<boolean> {
  return (await (await kv()).exists(stopKey(date))) > 0;
}

export async function setStopped(date: string, stop: boolean): Promise<void> {
  const store = await kv();
  if (stop) await store.set(stopKey(date), 1, { ex: 14 * 86400 });
  else await store.del(stopKey(date));
  if (await isLocked(date)) throw new Error(STARTED);
}

export async function getMarks(): Promise<Record<string, Announce>> {
  return (await (await kv()).hgetall<Record<string, Announce>>("th:events")) ?? {};
}

export async function saveMark(id: string, mark: Announce): Promise<void> {
  await (await kv()).hset("th:events", { [id]: mark });
}

export async function listRuns(): Promise<Run[]> {
  return (await (await kv()).lrange<Run>("th:runs", 0, 59)) ?? [];
}

async function addRun(run: Omit<Run, "at">): Promise<void> {
  const store = await kv();
  await store.lpush("th:runs", { ...run, at: new Date().toISOString() });
  await store.ltrim("th:runs", 0, 199);
}

export async function getDraft(date: string): Promise<Draft | null> {
  return (await (await kv()).get<Draft>(draftKey(date))) ?? null;
}

async function putDraft(d: Draft): Promise<void> {
  await (await kv()).set(draftKey(d.date), d, { ex: 14 * 86400 });
}

/** 投稿が始まった（終わった）日は、画面から直せない */
export async function isLocked(date: string): Promise<boolean> {
  return (await (await kv()).exists(lockKey(date))) > 0;
}

/** createdAt は画面が見ていた下書きの印。作り直された下書きに、古い本文を書き込ませない */
export async function editDraft(date: string, createdAt: string, text: string): Promise<void> {
  if (await isLocked(date)) throw new Error(STARTED);
  const d = await getDraft(date);
  if (!d || d.createdAt !== createdAt) throw new Error("下書きが新しくなっています。画面を開き直してください");
  const { errors } = checkText(text, d.events.map((e) => e.line));
  if (errors.length) throw new Error(errors.join("、"));
  await putDraft({ ...d, text, status: "ready", note: undefined, edited: true });
  if (await isLocked(date)) throw new Error(STARTED);
}

// ───────── 予定 ─────────

export type World = {
  settings: Settings;
  all: PlanEvent[];
  marks: Record<string, Announce>;
  pub: PublicEvent[];
  skips: string[];
  posting: (date: string) => boolean;
};

export async function loadWorld(): Promise<World> {
  const [settings, events, marks, closures, skips] = await Promise.all([getSettings(), getEvents(), getMarks(), listClosures(), listSkips()]);
  // ここで id・題・日付だけに絞る。note・place はこの先に渡さない
  const all = events.map(({ id, title, date }) => ({ id, title, date }));
  return {
    settings,
    all,
    marks,
    skips,
    pub: publicEvents(all, marks, settings.runAlways),
    posting: (d) => isBusinessDay(d, SHOP.closedWeekday, closures) && !skips.includes(d),
  };
}

export const postMinutes = (s: Settings) => toMin(s.time) ?? 19 * 60;

export function nextDate(w: World, now = jstNow()): string | null {
  return nextPostDate(now, postMinutes(w.settings), w.posting);
}

// ───────── AI ─────────

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const jp = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日（${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]}）`;

function ask(theme: Theme, events: PublicEvent[], date: string): string {
  if (theme === "before" || theme === "three") {
    const rows = events.map((e) => {
      const n = Math.round((Date.parse(e.date) - Date.parse(date)) / DAY);
      const when = n === 1 ? "明日" : n === 2 ? "あさって" : `${n}日後`;
      return `- ${jp(e.date)}（投稿する日から見て${when}） ${e.title}：${e.line}`;
    });
    return `次のイベントを告知する投稿。日付を必ず書く。\n${rows.join("\n")}`;
  }
  return {
    yoru: "夜の居場所を探している近くの人に、夜遅くまで開いている場所があると伝える投稿。",
    hours: "営業時間と定休日を知ってもらう投稿。",
    place: "彦根駅・彦根城の近くに夜カフェがあると知ってもらう投稿。",
    run: "毎週木曜のランクラブを紹介する投稿。特定の日付や「今日」「明日」「今週」は書かない。",
  }[theme];
}

const OutSchema = z.object({ text: z.string() });

async function writeText(w: World, theme: Theme, events: PublicEvent[], date: string, recent: string[], problem?: string): Promise<string> {
  const cafe = SHOP.hours.find((h) => h.label === "カフェ");
  const aboutRun = theme === "run" || events.some((e) => e.isRun);
  const res = await new Anthropic({ timeout: 60_000, maxRetries: 0 }).beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_format: betaZodOutputFormat(OutSchema),
    system:
      "滋賀県彦根市のカフェ＆バー flat. の Threads の投稿文を1つ書く。読むのは、まだ flat. を知らない近くの人。\n" +
      "店の人が話すような、気取らない日本語。300字以内。絵文字は0〜2個。ハッシュタグは付けない。\n" +
      "渡した材料に書いてあることだけで書く。値段・メニュー・人数・実績・雰囲気の細部など、材料に無いことは書かない。\n" +
      "電話番号とメールアドレスは書かない。「今開いています」のように営業中だと言い切らない。\n" +
      (aboutRun ? "" : "ランクラブ・ランニングのことは書かない（週によって休みがあるため）。\n") +
      "最近の投稿と、書き出し・言い回し・構成を変える。店名は flat. と書く。",
    messages: [
      {
        role: "user",
        content:
          `# 投稿する日時\n${jp(date)} ${w.settings.time}\n\n` +
          `# 書くこと\n${ask(theme, events, date)}\n\n` +
          `# 材料\n- 店：${SHOP.name}（${SHOP.address}）\n- カフェ ${cafe?.from}〜${cafe?.to}\n- ${w.settings.nightLine}\n- 定休日：${SHOP.closedLabel}\n${w.settings.memo}\n${aboutRun ? `ランクラブ：${w.settings.runMemo}\n` : ""}\n` +
          `# 最近の投稿（似せない）\n${recent.length ? recent.map((t) => `---\n${t}`).join("\n") : "なし"}` +
          (problem ? `\n\n# 前に書いた文の問題（直すこと）\n${problem}` : ""),
      },
    ],
  });
  if (res.stop_reason !== "end_turn" || !res.parsed_output) throw new Error("AIが文面を書けませんでした");
  return res.parsed_output.text.trim();
}

/** 下書きを作って保存する。前の下書きがあれば置き換える */
export async function makeDraft(date: string, w: World, note?: string): Promise<Draft> {
  const store = await kv();
  if (!(await store.set(`th:gen:${date}`, 1, { nx: true, ex: 180 }))) throw new Error("いま作っているところです。少し待ってください");
  try {
    if (await isLocked(date)) throw new Error("この日の投稿はもう始まっています");
    const runs = await listRuns();
    const posted = runs.filter((r) => r.status === "posted" || r.status === "check");
    const isRotation = (t?: Theme) => !!t && (ROTATION as readonly string[]).includes(t);
    const { theme, events } = pickTheme(date, w.pub, w.all, w.posting, posted.find((r) => isRotation(r.theme))?.theme);
    const recent = posted.slice(0, 14).map((r) => r.text ?? "").filter(Boolean);
    const allowed = events.map((e) => e.line);

    let text = await writeText(w, theme, events, date, recent);
    let found = checkText(text, allowed);
    if (found.errors.length || found.warnings.length) {
      text = await writeText(w, theme, events, date, recent, [...found.errors, ...found.warnings].join("\n"));
      found = checkText(text, allowed);
    }
    const bad = [...found.errors, ...found.warnings];
    const d: Draft = {
      date, theme, events, text,
      status: bad.length ? "hold" : "ready",
      note: bad.length ? `確認してください：${bad.join("、")}` : note,
      createdAt: new Date().toISOString(),
    };
    // 書いている間に投稿が始まっていたら、置き換えない
    if (await isLocked(date)) throw new Error("この日の投稿はもう始まっています");
    await putDraft(d);
    return d;
  } finally {
    await store.del(`th:gen:${date}`);
  }
}

// ───────── Threads API ─────────

/** 相手が「できない」と答えた失敗。時間切れや500番台は、できたのか分からないので分ける */
class Refused extends Error {}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string } | string; error_message?: string })
    | null;
  if (!res.ok || !body || body.error) {
    const e = body?.error;
    const text = (typeof e === "object" ? e?.message : e) || body?.error_message || `Threads API ${res.status}`;
    throw res.status >= 400 && res.status < 500 ? new Refused(text) : new Error(text);
  }
  return body;
}

const q = (p: Record<string, string>) => new URLSearchParams(p).toString();

export const threadsConfigured = () => !!(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);
const redirectUri = (origin: string) => `${origin}/api/threads/callback`;

/** 許可の画面へ行くときの合い言葉。1回だけ使える */
export async function issueState(nonce: string): Promise<void> {
  await (await kv()).set(`th:oauth:${nonce}`, 1, { ex: 600 });
}
export async function takeState(nonce: string): Promise<boolean> {
  return (await (await kv()).del(`th:oauth:${nonce}`)) === 1;
}

export function authorizeUrl(origin: string, state: string): string {
  if (!threadsConfigured()) throw new Error("THREADS_APP_ID と THREADS_APP_SECRET が未設定です");
  return `https://threads.com/oauth/authorize?${q({
    client_id: process.env.THREADS_APP_ID!.trim(),
    redirect_uri: redirectUri(origin),
    scope: "threads_basic,threads_content_publish",
    response_type: "code",
    state,
  })}`;
}

export async function getConn(): Promise<Conn | null> {
  return (await (await kv()).get<Conn>("th:conn")) ?? null;
}

async function putConn(c: Conn): Promise<void> {
  await (await kv()).set("th:conn", c);
}

export async function disconnect(): Promise<void> {
  await (await kv()).del("th:conn");
}

export async function connectThreads(origin: string, code: string): Promise<void> {
  const secret = process.env.THREADS_APP_SECRET!.trim();
  const short = await call<{ access_token: string }>(`${HOST}/oauth/access_token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.THREADS_APP_ID!.trim(),
      client_secret: secret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(origin),
      code,
    }),
  });
  const long = await call<{ access_token: string; expires_in: number }>(
    `${HOST}/access_token?${q({ grant_type: "th_exchange_token", client_secret: secret, access_token: short.access_token })}`,
  );
  const me = await call<{ id: string; username?: string }>(
    `${HOST}/v1.0/me?${q({ fields: "id,username", access_token: long.access_token })}`,
  );
  await putConn({
    token: long.access_token,
    userId: me.id,
    username: me.username ?? "",
    expiresAt: Date.now() + long.expires_in * 1000,
    refreshedAt: new Date().toISOString(),
  });
}

/** トークンは60日で切れる。7日たったら延ばす。失敗したら1日あけて試す */
async function refreshIfOld(c: Conn): Promise<Conn> {
  if (Date.now() - Date.parse(c.refreshedAt) < 7 * DAY) return c;
  const store = await kv();
  if (!(await store.set("th:refresh", 1, { nx: true, ex: 86400 }))) return c;
  let next: Conn;
  try {
    const r = await call<{ access_token: string; expires_in: number }>(
      `${HOST}/refresh_access_token?${q({ grant_type: "th_refresh_token", access_token: c.token })}`,
    );
    next = { ...c, token: r.access_token, expiresAt: Date.now() + r.expires_in * 1000, refreshedAt: new Date().toISOString(), lastError: undefined };
  } catch (e) {
    next = { ...c, lastError: `トークンの延長に失敗: ${msgOf(e)}` };
  }
  // 延ばしている間に、外された・つなぎ直されたなら触らない
  if ((await getConn())?.token !== c.token) return c;
  await putConn(next);
  return next;
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** 公開の手前まで。ここまでの失敗は、まだ何も出ていないのでやり直せる */
async function prepare(c: Conn, text: string, aiLabel: boolean): Promise<string> {
  const { id } = await call<{ id: string }>(`${HOST}/v1.0/${c.userId}/threads`, {
    method: "POST",
    body: new URLSearchParams({
      media_type: "TEXT",
      text,
      access_token: c.token,
      ...(aiLabel ? { is_made_with_ai: "true" } : {}),
    }),
  });
  for (let i = 0; i < 8; i++) {
    await sleep(10_000);
    const s = await call<{ status: string; error_message?: string }>(
      `${HOST}/v1.0/${id}?${q({ fields: "status,error_message", access_token: c.token })}`,
    );
    if (s.status === "FINISHED") return id;
    if (s.status !== "IN_PROGRESS") throw new Error(s.error_message || `Threadsの準備に失敗（${s.status}）`);
  }
  throw new Error("Threadsの準備が時間内に終わりませんでした");
}

// ───────── cron から ─────────

/** 出してはいけない理由。無ければ null */
async function blocked(date: string, d: Draft): Promise<string | null> {
  const [w, stopped] = await Promise.all([loadWorld(), isStopped(date)]);
  if (!w.settings.on) return "自動投稿がオフになった";
  if (stopped) return "止めてあった";
  if (!w.posting(date)) return "休みの日になった";
  if (draftStale(d.events, d.theme, date, w.pub, w.all)) return "直前に予定が変わった";
  return null;
}

async function post(date: string, time: string): Promise<string> {
  const store = await kv();
  if (!(await store.set(lockKey(date), 1, { nx: true, ex: 3 * 86400 }))) return "済み";
  const skip = async (detail: string, d?: Draft | null) => {
    await addRun({ date, time, status: "skipped", theme: d?.theme, text: d?.text, detail });
    return detail;
  };

  let containerId: string;
  let d: Draft | null = null;
  let conn: Conn | null;
  try {
    // 鍵をかけたあとで読み直す。直前の「出さない」や予定の変更を見落とさないため
    [d, conn] = await Promise.all([getDraft(date), getConn()]);
    if (!d) return skip("下書きが無かった");
    if (d.status === "hold") return skip(d.note || "確かめていない", d);
    const why = await blocked(date, d);
    if (why) return skip(why, d);
    if (!conn) return skip("Threadsにつながっていない", d);
    const { errors } = checkText(d.text, d.events.map((e) => e.line));
    if (errors.length) return skip(errors.join("、"), d);
    containerId = await prepare(conn, d.text, (await getSettings()).aiLabel);
    // 準備の間（長いと1分以上）に止められたり、予定が変わったりしていないか
    const late = await blocked(date, d);
    if (late) return skip(late, d);
  } catch (e) {
    const detail = msgOf(e);
    await addRun({ date, time, status: "error", theme: d?.theme, detail });
    await store.del(lockKey(date)); // まだ出ていないので、次の回でやり直す
    return detail;
  }

  let mediaId: string;
  try {
    const r = await call<{ id: string }>(`${HOST}/v1.0/${conn.userId}/threads_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: containerId, access_token: conn.token }),
    });
    mediaId = r.id;
  } catch (e) {
    const detail = msgOf(e);
    if (e instanceof Refused) {
      await addRun({ date, time, status: "error", theme: d.theme, detail });
      await store.del(lockKey(date));
    } else {
      // 出たのか分からない。やり直すと2回出るかもしれないので、ここで止める
      await addRun({ date, time, status: "check", theme: d.theme, text: d.text, detail: `出たかどうか確かめられません。Threadsを見てください（${detail}）` });
    }
    return detail;
  }

  const link = await call<{ permalink?: string }>(
    `${HOST}/v1.0/${mediaId}?${q({ fields: "permalink", access_token: conn.token })}`,
  ).catch(() => null);
  await addRun({ date, time, status: "posted", theme: d.theme, text: d.text, url: link?.permalink });
  return "投稿した";
}

/** 5分おき。何もすることが無ければ何もしない */
export async function tick(nowMs = Date.now()) {
  const now = jstNow(nowMs);
  const tomorrow = addDays(now.date, 1);
  const conn = await getConn();
  if (conn) await refreshIfOld(conn);
  const w = await loadWorld();
  const at = postMinutes(w.settings);
  const out: Record<string, string> = {};

  // 1. 投稿。AIの待ち時間で遅れないように先にする
  const slot = Date.parse(`${now.date}T00:00:00+09:00`) + at * 60_000;
  if (
    w.settings.on && w.settings.armedAt <= slot && w.posting(now.date) &&
    now.minutes >= at && now.minutes - at <= LATE_LIMIT_MIN
  ) {
    out.post = await post(now.date, w.settings.time);
  }

  // 2. 予定が変わった下書きを作り直す
  for (const date of [now.date, tomorrow]) {
    if (date === now.date && now.minutes > at - REBUILD_LIMIT) continue;
    const d = await getDraft(date);
    if (!d || !w.posting(date) || (await isStopped(date))) continue;
    if (!draftStale(d.events, d.theme, date, w.pub, w.all)) continue;
    try {
      // 失敗したら次の回でまた試す。古い文面は post() の確かめで止まる
      await makeDraft(date, w, "予定が変わったので作り直しました");
      out[date] = "作り直した";
    } catch (e) {
      out[date] = msgOf(e);
    }
  }

  // 3. 明日の下書き
  if (now.minutes >= DRAFT_AT && w.posting(tomorrow) && !(await getDraft(tomorrow))) {
    try {
      await makeDraft(tomorrow, w);
      out.draft = "作った";
    } catch (e) {
      out.draft = msgOf(e);
    }
  }
  return { ok: true, ...out };
}

// ───────── 画面に出すもの ─────────

export async function view() {
  const now = jstNow();
  const [w, conn, runs] = await Promise.all([loadWorld(), getConn(), listRuns()]);
  const date = nextDate(w, now);
  const draft = date ? await getDraft(date) : null;
  return {
    configured: threadsConfigured(),
    conn: conn && {
      username: conn.username,
      daysLeft: Math.floor((conn.expiresAt - Date.now()) / DAY),
      lastError: conn.lastError,
    },
    settings: w.settings,
    skips: w.skips,
    next: date && {
      date,
      draft,
      stopped: await isStopped(date),
      themeLabel: draft && THEME_LABEL[draft.theme],
      check: draft && checkText(draft.text, draft.events.map((e) => e.line)),
    },
    events: w.all
      .filter((e) => e.date > now.date)
      .slice(0, 60)
      .map((e) => {
        const m = w.marks[e.id];
        return { ...e, isRun: isThursdayRun(e), mark: markFits(m, e) ? m : null, live: w.pub.some((p) => p.id === e.id) };
      }),
    runs: runs.map((r) => ({ ...r, themeLabel: r.theme ? THEME_LABEL[r.theme] : "" })),
  };
}
