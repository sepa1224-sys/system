// 注文システムのメニューを、スタッフが自分で変えられるようにするための土台。
//
// これまで大分類（🍺アルコール など）は注文画面のコードに商品名を直書きしていた。
// 新しい商品を作ってもリストに名前を足さないと「その他」に落ちるので、
// メニューを変えるたびに開発が必要だった。
//
// これからは
//   商品・値段・大分類 … Squareのカタログ（レジや売上レポートと同じものを使う）
//   並び順・提供停止    … このファイル（KV）
// に置く。Squareに無いものは売れないので、商品の正はSquareに寄せる。

const PIN_KEY = "menu:pin";
const ORDER_KEY = "menu:catOrder";
const HIDDEN_KEY = "menu:hidden";
const ITEM_ORDER_KEY = "menu:itemOrder";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/* ── 暗証番号 ───────────────────────────────── */

/** 暗証番号が設定済みかどうか。未設定なら最初に決めてもらう */
export async function hasPin(): Promise<boolean> {
  const store = await kv();
  if (!store) return false;
  return !!(await store.get<string>(PIN_KEY));
}

export async function checkPin(pin: string): Promise<boolean> {
  const store = await kv();
  if (!store) return false;
  const saved = await store.get<string>(PIN_KEY);
  // 未設定のうちは誰でも通す（最初の1回で決めてもらうため）
  if (!saved) return true;
  return String(pin ?? "").trim() === saved;
}

export async function setPin(pin: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const p = String(pin ?? "").trim();
  if (!/^\d{4,8}$/.test(p)) throw new Error("暗証番号は4〜8桁の数字にしてください");
  await store.set(PIN_KEY, p);
}

/* ── 大分類の並び順 ─────────────────────────── */

/** 注文画面での大分類の並び。ここに無い分類は後ろに回る */
export async function getCategoryOrder(): Promise<string[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<string[]>(ORDER_KEY)) ?? [];
}

export async function setCategoryOrder(names: string[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(ORDER_KEY, names.filter((n) => typeof n === "string"));
}

/* ── 商品の並び順 ───────────────────────────── */

/** 注文画面での商品の並び。商品IDを並べたもの。ここに無い商品は後ろに回る */
export async function getItemOrder(): Promise<string[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<string[]>(ITEM_ORDER_KEY)) ?? [];
}

export async function setItemOrder(ids: string[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(ITEM_ORDER_KEY, ids.filter((i) => typeof i === "string"));
}

/** 決めた順に並べる。順序表に無いものは後ろへ（名前順） */
export function sortItems<T extends { id: string; name: string }>(
  items: T[],
  order: string[],
): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.name.localeCompare(b.name, "ja");
  });
}

/* ── 提供停止 ───────────────────────────────── */

/**
 * 注文画面に出さない商品のID。
 * Squareから消してしまうと過去の売上が追いにくくなるので、
 * 期間限定メニューが終わったときは消さずにここへ入れる。
 */
export async function getHidden(): Promise<string[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<string[]>(HIDDEN_KEY)) ?? [];
}

export async function setHidden(itemId: string, hidden: boolean): Promise<string[]> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const cur = new Set((await store.get<string[]>(HIDDEN_KEY)) ?? []);
  if (hidden) cur.add(itemId);
  else cur.delete(itemId);
  const next = [...cur];
  await store.set(HIDDEN_KEY, next);
  return next;
}

/* ── 並び替え ───────────────────────────────── */

/** 大分類の名前を、決めた順に並べる。順序表に無いものは後ろへ（名前順） */
export function sortCategories(names: string[], order: string[]): string[] {
  const rank = new Map(order.map((n, i) => [n, i]));
  return [...names].sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.localeCompare(b, "ja");
  });
}
