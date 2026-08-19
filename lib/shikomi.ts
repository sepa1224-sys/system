// 週間の仕込み・確認スケジュール（内部用）。
// 「店に来たときに何をやるか」が分かることが目的なので、
// 決まった曜日ではなく「前回やってから何日経ったか」で出す。
// 曜日固定にすると休みや来店のばらつきでずれていくため。

const KEY = "shikomi:records";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type TaskKind = "仕込み" | "確認" | "清掃";

export type Task = {
  id: string;
  name: string;
  kind: TaskKind;
  /** 何日おきにやるか */
  intervalDays: number;
  /** 1回あたりの分量 */
  qty?: string;
  /** 使う材料と量。発注量の目安にもなる */
  materials?: string;
  note?: string;
  /** 目安の所要時間（分） */
  minutes?: number;
};

/**
 * 定期作業の一覧。増やすときはここに足す。
 * 周期は実績に合わせて調整していく前提の初期値。
 */
export const TASKS: Task[] = [
  {
    id: "mashed-potato",
    name: "マッシュポテトの仕込み",
    kind: "仕込み",
    intervalDays: 7,
    qty: "800g",
    materials: "ポテトフレーク 150g",
    note: "タッパに入れて冷蔵",
    minutes: 20,
  },
  {
    id: "amiebi-cream-cheese",
    name: "あみえびのクリームチーズ",
    kind: "仕込み",
    intervalDays: 11, // 1.5週間
    materials: "クリームチーズ・あみえびうま煮",
    minutes: 20,
  },
  {
    id: "stock-check",
    name: "在庫の確認",
    kind: "確認",
    intervalDays: 7,
    note: "冷蔵庫・冷凍庫・棚。切れそうなものは発注へ",
    minutes: 30,
  },
];

/** 実施の記録。組込みのRecord型と紛らわしいのでDoneLogにしている */
export type DoneLog = { taskId: string; date: string; note?: string; by?: string };

export async function getRecords(): Promise<DoneLog[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<DoneLog[]>(KEY)) ?? [];
}

export async function addRecord(r: DoneLog): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<DoneLog[]>(KEY)) ?? [];
  list.push(r);
  await store.set(KEY, list);
}

export async function removeRecord(taskId: string, date: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<DoneLog[]>(KEY)) ?? [];
  const i = list.findIndex((x) => x.taskId === taskId && x.date === date);
  if (i >= 0) {
    list.splice(i, 1);
    await store.set(KEY, list);
  }
}

export const todayJST = () =>
  new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

const addDays = (d: string, n: number) =>
  new Date(new Date(d + "T00:00:00Z").getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

const dayDiff = (a: string, b: string) =>
  Math.round(
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) /
      86_400_000,
  );

export type Status = "overdue" | "today" | "soon" | "ok" | "never";

export type TaskState = Task & {
  lastDate: string | null;
  /** 前回からの経過日数 */
  daysSince: number | null;
  nextDate: string | null;
  /** 次回まであと何日。マイナスは超過 */
  daysUntil: number | null;
  status: Status;
  doneToday: boolean;
  history: DoneLog[];
};

export function buildStates(records: DoneLog[], today = todayJST()): TaskState[] {
  return TASKS.map((t) => {
    const history = records
      .filter((r) => r.taskId === t.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const lastDate = history[0]?.date ?? null;
    const daysSince = lastDate ? dayDiff(lastDate, today) : null;
    const nextDate = lastDate ? addDays(lastDate, t.intervalDays) : null;
    const daysUntil = nextDate ? dayDiff(today, nextDate) : null;

    let status: Status;
    if (!lastDate) status = "never";
    else if (daysUntil === null) status = "ok";
    else if (daysUntil < 0) status = "overdue";
    else if (daysUntil === 0) status = "today";
    else if (daysUntil <= 1) status = "soon";
    else status = "ok";

    return {
      ...t,
      lastDate,
      daysSince,
      nextDate,
      daysUntil,
      status,
      doneToday: history.some((r) => r.date === today),
      history: history.slice(0, 10),
    };
  }).sort((a, b) => {
    const rank: { [K in Status]: number } = {
      never: 0,
      overdue: 1,
      today: 2,
      soon: 3,
      ok: 4,
    };
    return rank[a.status] - rank[b.status] || (a.daysUntil ?? 0) - (b.daysUntil ?? 0);
  });
}
