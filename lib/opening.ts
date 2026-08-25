// 出勤したらやることのチェックリスト。
// 手順書ではなく「今日やったかどうか」を見るためのもので、
// 日付が変わればまっさらに戻る。
//
// 発注だけは毎日ではないので、最後にやった日から何日経ったかで出す。

const KEY = "opening:done";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** 朝＝開店前にやること／営業中＝手が空いたときにやること */
export type Phase = "朝" | "営業中";

export type Task = {
  id: string;
  phase: Phase;
  name: string;
  /** 迷いやすいところの補足 */
  detail?: string;
  /** 毎日ではない作業。何日おきか */
  everyDays?: number;
};

export const TASKS: Task[] = [
  {
    id: "espresso",
    phase: "朝",
    name: "エスプレッソマシンを立ち上げる",
    detail: "いちばん時間がかかるので最初に電源を入れる",
  },
  { id: "clean-floor", phase: "朝", name: "店舗掃除（掃除機・テーブル拭き）" },
  { id: "clean-toilet", phase: "朝", name: "トイレ掃除" },
  { id: "trash-bag", phase: "朝", name: "ゴミ袋のチェック" },
  {
    id: "waffle",
    phase: "朝",
    name: "ワッフルをセットする",
    detail:
      "前日に焼いたものが冷蔵庫にあればそれをセット。無ければ前日に仕込んだ生地を焼く。廃棄期限は2日",
  },
  {
    id: "dishes",
    phase: "朝",
    name: "前日洗った食器類を片付ける",
    detail: "ワッフルの準備をしながら進める",
  },
  {
    id: "duster",
    phase: "朝",
    name: "ダスターを畳んで片付ける",
    detail:
      "前の晩に干したものが乾いていたら畳む。汚れたダスターが溜まっていたら、その場で煮沸して干す",
  },
  {
    id: "stock-check",
    phase: "営業中",
    name: "在庫チェック",
    detail:
      "台下冷蔵庫に飲み物が全部入っているか確認する。入っていなければストレージから補充する",
  },
  {
    id: "order",
    phase: "営業中",
    name: "足りないものを発注する",
    detail: "在庫チェックで補充できなかったものを発注する",
    everyDays: 3,
  },
];

/** 日付ごとの、終わった作業のid */
type DoneMap = Record<string, string[]>;

export function todayJST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function load(): Promise<DoneMap> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<DoneMap>(KEY)) ?? {};
}

async function save(m: DoneMap) {
  const store = await kv();
  if (!store) return;
  // 古い記録は消す。60日分だけ残す
  const keep = Object.keys(m).sort().slice(-60);
  const next: DoneMap = {};
  for (const d of keep) next[d] = m[d];
  await store.set(KEY, next);
}

export async function getDone(date: string): Promise<string[]> {
  return (await load())[date] ?? [];
}

export async function toggle(date: string, taskId: string, done: boolean) {
  const m = await load();
  const cur = new Set(m[date] ?? []);
  if (done) cur.add(taskId);
  else cur.delete(taskId);
  m[date] = [...cur];
  await save(m);
  return [...cur];
}

/** その作業を最後にやった日。一度もなければ null */
export async function lastDoneDate(taskId: string): Promise<string | null> {
  const m = await load();
  const days = Object.keys(m)
    .filter((d) => (m[d] ?? []).includes(taskId))
    .sort();
  return days.length ? days[days.length - 1] : null;
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  );
}
