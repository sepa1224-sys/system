// レジ締めの記録。営業日ごとに1件。
// 締めた時点の現金売上も一緒に保存する（あとからSquare側が変わっても、
// そのとき何を根拠に締めたかが分かるようにするため）。

const KEY = "cashclose:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type CashClose = {
  date: string; // 営業日 YYYY-MM-DD（朝6時切替）
  floatCash: number; // 釣銭準備金
  cashSales: number; // 現金売上（締めた時点のSquareの値）
  cashOut: number; // レジから払った現金支出
  expected: number; // あるべき金額
  counted: number; // 実際に数えた金額
  diff: number; // counted - expected
  note?: string;
  closedAt: string;
  closedBy?: string;
};

export async function getCloses(): Promise<CashClose[]> {
  const store = await kv();
  if (!store) return [];
  const list = (await store.get<CashClose[]>(KEY)) ?? [];
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getClose(date: string): Promise<CashClose | null> {
  return (await getCloses()).find((c) => c.date === date) ?? null;
}

/** 同じ営業日があれば上書きする（締め直しに対応） */
export async function saveClose(c: CashClose): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<CashClose[]>(KEY)) ?? [];
  const i = list.findIndex((x) => x.date === c.date);
  if (i >= 0) list[i] = c;
  else list.push(c);
  await store.set(KEY, list);
}

export async function deleteClose(date: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const list = (await store.get<CashClose[]>(KEY)) ?? [];
  await store.set(KEY, list.filter((c) => c.date !== date));
}
