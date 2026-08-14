// KDSの「作り終えた」状態。
// 会計済みの注文も90分は表示するようにしたため、完了状態を画面のuseStateだけで
// 持っているとリロードで復活してしまう。端末をまたいでも揃うようKVに置く。

const KEY = "kds:done";
const KEEP_MS = 90 * 60_000; // 表示ウィンドウと同じ90分で自動的に捨てる

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

// { "注文ID_品目uid": 完了した時刻(ms) }
type DoneMap = Record<string, number>;

function prune(map: DoneMap): DoneMap {
  const limit = Date.now() - KEEP_MS;
  const out: DoneMap = {};
  for (const [k, t] of Object.entries(map)) {
    if (t >= limit) out[k] = t;
  }
  return out;
}

export async function getDoneKeys(): Promise<string[]> {
  const store = await kv();
  if (!store) return [];
  const map = (await store.get<DoneMap>(KEY)) ?? {};
  return Object.keys(prune(map));
}

export async function addDoneKeys(keys: string[]): Promise<void> {
  const store = await kv();
  if (!store) return;
  const map = prune((await store.get<DoneMap>(KEY)) ?? {});
  const now = Date.now();
  for (const k of keys) map[k] = now;
  await store.set(KEY, map);
}

export async function removeDoneKeys(keys: string[]): Promise<void> {
  const store = await kv();
  if (!store) return;
  const map = prune((await store.get<DoneMap>(KEY)) ?? {});
  for (const k of keys) delete map[k];
  await store.set(KEY, map);
}
