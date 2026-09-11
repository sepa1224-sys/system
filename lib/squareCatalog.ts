// Squareカタログの読み書き。メニュー編集画面から使う。
//
// Squareは「差分更新」ができない。いまのオブジェクトを取ってきて、
// 必要なところだけ書き換えて丸ごと戻す、という形になる。

const API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function hdrs() {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, { headers: hdrs(), ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.errors?.[0]?.detail || `Square API エラー(${res.status})`);
  }
  return data;
}

/** 種類を指定して、ページをまたいで全部取る */
async function listAll(types: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const d = await call(`/catalog/list?types=${types}${cursor ? `&cursor=${cursor}` : ""}`);
    out.push(...(d.objects || []));
    cursor = d.cursor;
  } while (cursor);
  return out;
}

export type SquareCategory = { id: string; name: string };
export type SquareVariation = { id: string; name: string; price: number | null };
export type SquareItem = {
  id: string;
  name: string;
  categoryId: string | null;
  category: string;
  variations: SquareVariation[];
};

export async function listCategories(): Promise<SquareCategory[]> {
  const objs = await listAll("CATEGORY");
  return objs
    .map((o: any) => ({ id: o.id, name: o.category_data?.name ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** 商品についている分類のID。新旧どちらの持ち方でも拾う */
function categoryIdOf(item: any): string | null {
  return (
    item.item_data?.reporting_category?.id ??
    item.item_data?.categories?.[0]?.id ??
    item.item_data?.category_id ??
    null
  );
}

export async function listItems(): Promise<SquareItem[]> {
  const [cats, objs] = await Promise.all([listCategories(), listAll("ITEM")]);
  const byId = new Map(cats.map((c) => [c.id, c.name]));
  return objs.map((o: any) => {
    const cid = categoryIdOf(o);
    return {
      id: o.id,
      name: o.item_data?.name ?? "",
      categoryId: cid,
      category: (cid && byId.get(cid)) || "",
      variations: (o.item_data?.variations || []).map((v: any) => ({
        id: v.id,
        name: v.item_variation_data?.name ?? "",
        price: v.item_variation_data?.price_money?.amount ?? null,
      })),
    };
  });
}

async function getObject(id: string): Promise<any> {
  const d = await call(`/catalog/object/${id}`);
  return d.object;
}

async function upsert(obj: any, tag: string) {
  const d = await call(`/catalog/object`, {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `${tag}_${obj.id?.slice(-8) ?? "new"}_${Date.now().toString(36)}`,
      object: obj,
    }),
  });
  return d.catalog_object;
}

/* ── 大分類 ─────────────────────────────────── */

export async function createCategory(name: string): Promise<SquareCategory> {
  const key = `cat_${Date.now()}`;
  const o = await upsert(
    { type: "CATEGORY", id: `#${key}`, category_data: { name } },
    "catnew",
  );
  return { id: o.id, name: o.category_data?.name ?? name };
}

export async function renameCategory(id: string, name: string): Promise<SquareCategory> {
  const cur = await getObject(id);
  cur.category_data = { ...(cur.category_data ?? {}), name };
  const o = await upsert(cur, "catren");
  return { id: o.id, name: o.category_data?.name ?? name };
}

export async function deleteCategory(id: string): Promise<void> {
  await call(`/catalog/object/${id}`, { method: "DELETE" });
}

/* ── 商品 ───────────────────────────────────── */

/** 分類を付け替える。Squareは持ち方が3通りあるので全部そろえて書く */
function applyCategory(itemData: any, categoryId: string | null) {
  if (categoryId) {
    // ordinal（分類内の並び番号）は指定しない。
    // 0を入れると2品目以降が「同じ番号がある」と弾かれる
    itemData.category_id = categoryId;
    itemData.categories = [{ id: categoryId }];
    itemData.reporting_category = { id: categoryId };
  } else {
    delete itemData.category_id;
    delete itemData.categories;
    delete itemData.reporting_category;
  }
}

export async function createItem(
  name: string,
  price: number,
  categoryId: string | null,
): Promise<SquareItem> {
  const key = `item_${Date.now()}`;
  const item_data: any = {
    name,
    variations: [
      {
        type: "ITEM_VARIATION",
        id: `#${key}_v`,
        item_variation_data: {
          name: "Regular",
          pricing_type: "FIXED_PRICING",
          price_money: { amount: price, currency: "JPY" },
        },
      },
    ],
  };
  applyCategory(item_data, categoryId);
  const o = await upsert({ type: "ITEM", id: `#${key}`, item_data }, "itemnew");
  return {
    id: o.id,
    name: o.item_data?.name ?? name,
    categoryId,
    category: "",
    variations: (o.item_data?.variations || []).map((v: any) => ({
      id: v.id,
      name: v.item_variation_data?.name ?? "",
      price: v.item_variation_data?.price_money?.amount ?? null,
    })),
  };
}

export async function updateItem(
  id: string,
  patch: { name?: string; categoryId?: string | null },
): Promise<void> {
  const cur = await getObject(id);
  if (patch.name) cur.item_data.name = patch.name;
  if (patch.categoryId !== undefined) applyCategory(cur.item_data, patch.categoryId);
  await upsert(cur, "itemupd");
}

/** 値段はバリエーション（Regular／チョコ 等）ごとに持っている */
export async function updateVariationPrice(variationId: string, price: number): Promise<void> {
  const cur = await getObject(variationId);
  cur.item_variation_data.price_money = { amount: price, currency: "JPY" };
  await upsert(cur, "varupd");
}

export async function deleteItem(id: string): Promise<void> {
  await call(`/catalog/object/${id}`, { method: "DELETE" });
}
