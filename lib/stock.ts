// 仕込み在庫管理：KVに保存

const STOCK_KEY = "stock:items";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type StockItem = {
  name: string;       // メニュー名（Square catalog名と一致）
  count: number;      // 現在の在庫数
  updatedAt: string;  // 最終更新日時
};

export async function getStock(): Promise<StockItem[]> {
  const client = await kv();
  if (!client) return [];
  const data = await client.get<StockItem[]>(STOCK_KEY);
  return data || [];
}

export async function saveStock(items: StockItem[]): Promise<void> {
  const client = await kv();
  if (!client) throw new Error("KV未設定");
  await client.set(STOCK_KEY, items);
}

// 特定アイテムの在庫を更新
export async function updateStockCount(name: string, delta: number): Promise<StockItem[]> {
  const items = await getStock();
  const idx = items.findIndex((i) => i.name === name);
  if (idx >= 0) {
    items[idx].count = Math.max(0, items[idx].count + delta);
    items[idx].updatedAt = new Date().toISOString();
  } else {
    items.push({ name, count: Math.max(0, delta), updatedAt: new Date().toISOString() });
  }
  await saveStock(items);
  return items;
}

// 注文で在庫を減らす
export async function decrementStock(name: string, qty: number): Promise<number> {
  const items = await getStock();
  const item = items.find((i) => i.name === name);
  if (!item) return -1; // 管理対象外
  if (item.count < qty) return item.count; // 在庫不足（現在の在庫数を返す）
  item.count -= qty;
  item.updatedAt = new Date().toISOString();
  await saveStock(items);
  return item.count; // 残りの在庫数
}
