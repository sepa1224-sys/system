// 発注の記録。
//
// ストック確認で「倉庫に無かった」ものが発注するものになる。
// ただし在庫確認は3日に1回なのに、届くまで5日かかるものもある。
// 素直に作ると、届く前にもう一度「倉庫に無い」と記録されて
// 同じものを二重に発注してしまう。
//
// そこで「発注したがまだ届いていないもの」を覚えておき、
// 発注リストから外す。届いたことは業務チェックの
// 「発注したものが届いたか確認」で押してもらう。

import { getChecks, getItems, type Item } from "@/lib/stockroom";
import { getInventoryItems } from "@/lib/inventory";

const ORDERS_KEY = "purchase:orders";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type OrderLine = {
  itemId: string;
  name: string;
  unit: string;
  qty: number;
  url?: string;
  supplier?: string;
};

export type PurchaseOrder = {
  id: string;
  /** 発注した日 YYYY-MM-DD */
  orderedAt: string;
  lines: OrderLine[];
  /** 店舗に届いた日。未着なら無い */
  arrivedAt?: string;
  note?: string;
};

export function todayJST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function getOrders(): Promise<PurchaseOrder[]> {
  const store = await kv();
  if (!store) return [];
  const all = (await store.get<PurchaseOrder[]>(ORDERS_KEY)) ?? [];
  return all.sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1));
}

async function saveAll(list: PurchaseOrder[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  // 届いたものは半年分だけ残す。未着はいくつでも残す
  const arrived = list.filter((o) => o.arrivedAt).sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1));
  const open = list.filter((o) => !o.arrivedAt);
  await store.set(ORDERS_KEY, [...open, ...arrived.slice(0, 100)]);
}

export async function addOrder(lines: OrderLine[], note?: string): Promise<PurchaseOrder> {
  if (!lines.length) throw new Error("発注するものがありません");
  const all = await getOrders();
  const day = todayJST();
  const sameDay = all.filter((o) => o.orderedAt === day).length;
  const order: PurchaseOrder = {
    id: `${day}-${sameDay + 1}`,
    orderedAt: day,
    lines,
    ...(note ? { note } : {}),
  };
  await saveAll([order, ...all]);
  return order;
}

/** 届いた日を記録する。date を空にすると未着に戻す */
export async function markArrived(id: string, date?: string): Promise<PurchaseOrder> {
  const all = await getOrders();
  const o = all.find((x) => x.id === id);
  if (!o) throw new Error("その発注が見つかりません");
  if (date) o.arrivedAt = date;
  else delete o.arrivedAt;
  await saveAll(all);
  return o;
}

export async function deleteOrder(id: string): Promise<void> {
  const all = await getOrders();
  await saveAll(all.filter((o) => o.id !== id));
}

/** まだ届いていない発注 */
export async function openOrders(): Promise<PurchaseOrder[]> {
  return (await getOrders()).filter((o) => !o.arrivedAt);
}

/** 発注済みで未着の品目。二重発注を防ぐために発注リストから外す */
async function pendingItemIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const o of await openOrders()) for (const l of o.lines) ids.add(l.itemId);
  return ids;
}

export type Candidate = {
  itemId: string;
  name: string;
  group: string;
  unit: string;
  /** ストックルームに置いておく数。発注数の初期値に使う */
  par: number;
  qty: number;
  url?: string;
  supplier?: string;
  price?: number;
  /** 仕入れ表に繋がっていないので、発注先が分からない */
  needsLink?: boolean;
};

/** ストック確認の記録から、いま発注すべきものを組み立てる */
export async function buildCandidates(): Promise<{
  checkDate: string | null;
  candidates: Candidate[];
  /** 倉庫に無かったが、発注ではなく仕込みで足すもの */
  toPrepare: { itemId: string; name: string; unit: string }[];
  /** 発注済みで未着のため、今回は出さなかったもの */
  waiting: { itemId: string; name: string; orderedAt: string }[];
}> {
  const [checks, items, inv, open] = await Promise.all([
    getChecks(),
    getItems(),
    getInventoryItems(),
    openOrders(),
  ]);
  const latest = checks[0];
  if (!latest) return { checkDate: null, candidates: [], toPrepare: [], waiting: [] };

  const byId = new Map<string, Item>(items.map((i) => [i.id, i]));
  const invById = new Map(inv.map((i) => [i.id, i]));
  const pending = await pendingItemIds();

  const candidates: Candidate[] = [];
  const toPrepare: { itemId: string; name: string; unit: string }[] = [];
  const waiting: { itemId: string; name: string; orderedAt: string }[] = [];

  for (const [itemId, result] of Object.entries(latest.results)) {
    if (result !== "short") continue;
    const item = byId.get(itemId);
    if (!item) continue;
    if (item.madeInHouse) {
      toPrepare.push({ itemId, name: item.name, unit: item.unit });
      continue;
    }
    if (pending.has(itemId)) {
      const o = open.find((x) => x.lines.some((l) => l.itemId === itemId));
      waiting.push({ itemId, name: item.name, orderedAt: o?.orderedAt ?? "" });
      continue;
    }
    const linked = item.buyId != null ? invById.get(item.buyId) : undefined;
    candidates.push({
      itemId,
      name: item.name,
      group: item.group,
      unit: item.unit,
      par: item.par,
      qty: item.orderQty ?? 1,
      url: linked?.url || undefined,
      supplier: linked?.supplier || undefined,
      price: linked?.price,
      needsLink: !linked,
    });
  }

  candidates.sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group)));
  return { checkDate: latest.date, candidates, toPrepare, waiting };
}
