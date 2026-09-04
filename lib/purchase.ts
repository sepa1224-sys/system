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

/**
 * 支払い方法。経理の経路がこれで決まる。
 *   card … 会社のデビットカード。数日後に銀行明細に出るので、
 *          こちらからfreeeに登録してはいけない（二重計上になる）
 *   own  … 立替。明細に出ないのでレシート登録の対象
 *   cash … 現金払い。同上
 */
export type PaidBy = "card" | "own" | "cash";

export type PurchaseOrder = {
  id: string;
  /** 発注した日 YYYY-MM-DD */
  orderedAt: string;
  lines: OrderLine[];
  /** 店舗に届いた日。未着なら無い */
  arrivedAt?: string;
  /** どこで買ったか。明細と突き合わせるのに使う */
  shop?: string;
  paidBy?: PaidBy;
  /** 実際に払った額（税込）。概算ではなくレシートの数字 */
  paidAmount?: number;
  /** 銀行明細と突き合わせて経理が済んだ日 */
  bookedAt?: string;
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
  // 発注の履歴は分析に使うので長く残す。未着はいくつでも残す
  const arrived = list.filter((o) => o.arrivedAt).sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1));
  const open = list.filter((o) => !o.arrivedAt);
  await store.set(ORDERS_KEY, [...open, ...arrived.slice(0, 1000)]);
}

export async function addOrder(
  lines: OrderLine[],
  note?: string,
  extra?: { shop?: string; paidBy?: PaidBy; paidAmount?: number },
): Promise<PurchaseOrder> {
  if (!lines.length) throw new Error("発注するものがありません");
  const all = await getOrders();
  const day = todayJST();
  const sameDay = all.filter((o) => o.orderedAt === day).length;
  const order: PurchaseOrder = {
    id: `${day}-${sameDay + 1}`,
    orderedAt: day,
    lines,
    ...(extra?.shop ? { shop: extra.shop } : {}),
    ...(extra?.paidBy ? { paidBy: extra.paidBy } : {}),
    ...(extra?.paidAmount ? { paidAmount: extra.paidAmount } : {}),
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

export type ItemStat = {
  itemId: string;
  name: string;
  group: string;
  /** 在庫確認で「倉庫に無かった」と記録された回数 */
  shortCount: number;
  /** 在庫確認に出てきた回数（分母） */
  checkCount: number;
  /** 発注した回数 */
  orderCount: number;
  /** 発注した数の合計 */
  orderedQty: number;
  unit: string;
  lastOrderedAt?: string;
  /** 発注から到着までの平均日数。届いた記録が無ければ無し */
  leadDays?: number;
};

/**
 * 品目ごとの傾向。切らしやすいものと、届くまでの日数が分かる。
 *
 * 切らす回数が多い品目は、ストックルームに置く数(par)が少なすぎる。
 * リードタイムが長いものは、在庫確認の間隔より先に頼まないと間に合わない。
 */
export async function itemStats(): Promise<{ from: string | null; to: string | null; stats: ItemStat[] }> {
  const [checks, items, orders] = await Promise.all([getChecks(), getItems(), getOrders()]);
  const byId = new Map<string, Item>(items.map((i) => [i.id, i]));
  const map = new Map<string, ItemStat>();

  const stat = (id: string): ItemStat | null => {
    const item = byId.get(id);
    if (!item) return null;
    let st = map.get(id);
    if (!st) {
      st = {
        itemId: id,
        name: item.name,
        group: item.group,
        shortCount: 0,
        checkCount: 0,
        orderCount: 0,
        orderedQty: 0,
        unit: item.unit,
      };
      map.set(id, st);
    }
    return st;
  };

  for (const c of checks) {
    for (const [id, r] of Object.entries(c.results)) {
      const st = stat(id);
      if (!st) continue;
      st.checkCount++;
      if (r === "short") st.shortCount++;
    }
  }

  // 発注の回数と、届くまでにかかった日数
  const leads = new Map<string, number[]>();
  for (const o of orders) {
    for (const l of o.lines) {
      const st = stat(l.itemId);
      if (!st) continue;
      st.orderCount++;
      st.orderedQty += l.qty;
      if (!st.lastOrderedAt || st.lastOrderedAt < o.orderedAt) st.lastOrderedAt = o.orderedAt;
      if (o.arrivedAt) {
        const d = Math.round((Date.parse(o.arrivedAt) - Date.parse(o.orderedAt)) / 86400000);
        leads.set(l.itemId, [...(leads.get(l.itemId) ?? []), d]);
      }
    }
  }
  for (const [id, ds] of leads) {
    const st = map.get(id);
    if (st && ds.length) st.leadDays = Math.round((ds.reduce((a, b) => a + b, 0) / ds.length) * 10) / 10;
  }

  const dates = checks.map((c) => c.date).sort();
  const stats = [...map.values()].sort(
    (a, b) => b.shortCount - a.shortCount || b.orderCount - a.orderCount || a.name.localeCompare(b.name),
  );
  return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, stats };
}

/**
 * 銀行明細と突き合わせるための、カード払いの発注。
 *
 * カード払いは数日後に明細へ出る。こちらからfreeeに登録すると
 * 明細側の取引と二重になるので、登録はしない。
 * 代わりに「この明細はこの発注では」と候補を出して、
 * freeeのUIで消し込むときの手がかりにする。
 */
export async function cardOrdersForMatching(): Promise<PurchaseOrder[]> {
  return (await getOrders()).filter((o) => o.paidBy === "card" && !o.bookedAt);
}

/** 明細と突き合わせて経理が済んだことを記録する */
export async function markBooked(id: string, date?: string): Promise<void> {
  const all = await getOrders();
  const o = all.find((x) => x.id === id);
  if (!o) throw new Error("その発注が見つかりません");
  if (date) o.bookedAt = date;
  else delete o.bookedAt;
  await saveAll(all);
}

/**
 * 明細1件に対して、金額と日付が近いカード払いの発注を探す。
 * 金額はぴったり、日付は発注日から10日以内を候補にする。
 */
export async function matchTxn(
  amount: number,
  date: string,
): Promise<PurchaseOrder[]> {
  const cands = await cardOrdersForMatching();
  const t = Date.parse(`${date}T00:00:00Z`);
  return cands
    .filter((o) => {
      const days = (t - Date.parse(`${o.orderedAt}T00:00:00Z`)) / 86400000;
      if (days < 0 || days > 10) return false;
      return o.paidAmount === amount;
    })
    .sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1));
}
