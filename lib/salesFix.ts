// 会計だけSquareのレジで打たれて品目が残らなかった注文に、
// あとから中身を入れるための対応表。
//
// Squareは会計済み(COMPLETED)の注文の明細を書き換えられないので、
// Square側は「金額入力」のまま。こちらで中身を覚えておき、
// 売上の商品別集計にだけ反映する。金額は変えない（合計はSquareが正）。

const KEY = "sales:itemFix";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type FixItem = { name: string; qty: number; amount: number };
/** SquareのorderId → 実際に出した品目 */
export type FixMap = Record<string, FixItem[]>;

export async function getFixes(): Promise<FixMap> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<FixMap>(KEY)) ?? {};
}

export async function saveFix(orderId: string, items: FixItem[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getFixes();
  if (items.length) all[orderId] = items;
  else delete all[orderId];
  await store.set(KEY, all);
}
