// 毎日その場で切らすと店が回らなくなるものを、朝と夜に数える。
//
// 在庫確認（3日に1回）とは別物。こちらは回転が速く、
// 切れた時点で提供できなくなるものだけを毎日見る。
//
// 数えた結果、足りなければ業務チェックに手当ての作業が自動で出る。
// 牛乳は買いに行く、コールドブリューは仕込む、と手当ての中身が違うので分けてある。

export type Slot = "morning" | "evening";

/** 数えるもの。count は個数、full は満タンかどうか */
export type CheckItem = {
  id: string;
  name: string;
  kind: "count" | "full";
  unit?: string;
  /** 常にあるべき数 */
  par?: number;
  /** これ以下になったら手当てが要る */
  lowAt?: number;
  /** 手当てのしかた。buy=買う prep=仕込む refill=足す */
  action: "buy" | "prep" | "refill";
  actionText: string;
};

export const CHECK_ITEMS: CheckItem[] = [
  {
    id: "milk",
    name: "牛乳",
    kind: "count",
    unit: "本",
    par: 3,
    lowAt: 3,
    action: "buy",
    actionText: "平和堂に電話して持ってきてもらうか、午後のシフトの人に買い出しを頼む",
  },
  {
    id: "cold-brew",
    name: "コールドブリュー",
    kind: "count",
    unit: "本",
    par: 2,
    lowAt: 1,
    action: "prep",
    actionText: "抽出に時間がかかるので、その場ですぐ仕込む",
  },
  {
    id: "bread",
    name: "食パン",
    kind: "count",
    unit: "斤",
    par: 3,
    lowAt: 2,
    action: "buy",
    actionText:
      "日持ちが2〜3日しかないので、まとめ買いはしない。2日分だけ買い足す（1斤6枚＝ホットサンド3個分）",
  },
  {
    id: "americano-water",
    name: "アメリカーノ用の水",
    kind: "full",
    action: "refill",
    actionText: "満タンまで足す",
  },
];

const KEY = "dailycheck:values";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** 品目id → 個数（count）または満タンかどうか（full） */
export type Values = Record<string, number | boolean>;
type Entry = { values: Values; at: string };
type Day = Partial<Record<Slot, Entry>>;
type Store = Record<string, Day>;

export async function getAll(): Promise<Store> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Store>(KEY)) ?? {};
}

export async function saveValues(date: string, slot: Slot, values: Values): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getAll();
  const day = all[date] ?? {};
  day[slot] = { values, at: new Date().toISOString() };
  all[date] = day;
  const keep = Object.keys(all).sort().slice(-365);
  const next: Store = {};
  for (const d of keep) next[d] = all[d];
  await store.set(KEY, next);
}

export type Need = { id: string; name: string; action: CheckItem["action"]; text: string };

/** 足りないもの。数えていなければ空 */
export function needs(values: Values | undefined): Need[] {
  if (!values) return [];
  const out: Need[] = [];
  for (const it of CHECK_ITEMS) {
    const v = values[it.id];
    if (v === undefined) continue;
    if (it.kind === "full") {
      if (v === false) out.push({ id: it.id, name: it.name, action: it.action, text: it.actionText });
      continue;
    }
    const n = Number(v);
    if (it.lowAt !== undefined && n <= it.lowAt) {
      out.push({
        id: it.id,
        name: `${it.name}（${n}${it.unit ?? ""}）`,
        action: it.action,
        text: it.actionText,
      });
    }
  }
  return out;
}

export async function dayState(date: string) {
  const all = await getAll();
  const day = all[date] ?? {};
  const build = (slot: Slot) => {
    const e = day[slot];
    return {
      counted: !!e,
      values: e?.values ?? null,
      needs: needs(e?.values),
    };
  };
  return { items: CHECK_ITEMS, morning: build("morning"), evening: build("evening") };
}
