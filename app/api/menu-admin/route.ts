import { NextRequest, NextResponse } from "next/server";
import {
  listCategories,
  listItems,
  createCategory,
  renameCategory,
  deleteCategory,
  createItem,
  updateItem,
  updateVariationPrice,
  updateVariations,
  deleteItem,
} from "@/lib/squareCatalog";
import {
  checkPin,
  setPin,
  hasPin,
  getCategoryOrder,
  setCategoryOrder,
  getHidden,
  setHidden,
  sortCategories,
  getItemOrder,
  setItemOrder,
  sortItems,
} from "@/lib/menuAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

// メニュー編集画面の裏側。
// 商品・値段・大分類はSquareへ、並び順と提供停止はKVへ書く。
//
// 書き込みは必ず暗証番号を確かめる。画面を隠すだけだと、
// URLを知っていれば誰でも値段を変えられてしまう。

// GET → 編集画面に出すもの一式
export async function GET() {
  try {
    const [categories, items, order, itemOrder, hidden, pinSet] = await Promise.all([
      listCategories(),
      listItems(),
      getCategoryOrder(),
      getItemOrder(),
      getHidden(),
      hasPin(),
    ]);
    const names = sortCategories(
      [...new Set(categories.map((c) => c.name))],
      order,
    );
    return NextResponse.json({
      categories,
      categoryOrder: names,
      items: sortItems(items, itemOrder),
      itemOrder,
      hidden,
      pinSet,
      uncategorized: items.filter((i) => !i.categoryId).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

type Body = {
  pin?: string;
  action?: string;
  id?: string;
  name?: string;
  price?: number;
  categoryId?: string | null;
  variationId?: string;
  hidden?: boolean;
  names?: string[];
  ids?: string[];
  newPin?: string;
  variations?: { id?: string; name: string; price: number }[];
};

export async function POST(req: NextRequest) {
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  // 暗証番号の確認だけを先に返す（画面を開くとき用）
  if (b.action === "auth") {
    return NextResponse.json({ ok: await checkPin(b.pin ?? "") });
  }

  if (!(await checkPin(b.pin ?? ""))) {
    return NextResponse.json({ error: "暗証番号が違います" }, { status: 401 });
  }

  try {
    switch (b.action) {
      case "pin.set":
        await setPin(b.newPin ?? "");
        return NextResponse.json({ ok: true });

      case "category.create": {
        if (!b.name?.trim()) throw new Error("分類名を入れてください");
        const c = await createCategory(b.name.trim());
        // 新しい分類は末尾に置く
        const order = await getCategoryOrder();
        if (!order.includes(c.name)) await setCategoryOrder([...order, c.name]);
        return NextResponse.json({ ok: true, category: c });
      }
      case "category.rename": {
        if (!b.id || !b.name?.trim()) throw new Error("分類と新しい名前が必要です");
        const before = (await listCategories()).find((c) => c.id === b.id)?.name;
        const c = await renameCategory(b.id, b.name.trim());
        const order = await getCategoryOrder();
        if (before) {
          await setCategoryOrder(order.map((n) => (n === before ? c.name : n)));
        }
        return NextResponse.json({ ok: true, category: c });
      }
      case "category.delete": {
        if (!b.id) throw new Error("分類が必要です");
        const items = await listItems();
        const used = items.filter((i) => i.categoryId === b.id);
        if (used.length > 0) {
          return NextResponse.json(
            {
              error: `この分類には${used.length}品が入っています。先に別の分類へ移してください`,
              items: used.map((i) => i.name),
            },
            { status: 409 },
          );
        }
        const name = (await listCategories()).find((c) => c.id === b.id)?.name;
        await deleteCategory(b.id);
        if (name) {
          await setCategoryOrder((await getCategoryOrder()).filter((n) => n !== name));
        }
        return NextResponse.json({ ok: true });
      }
      case "category.reorder":
        if (!Array.isArray(b.names)) throw new Error("並び順が必要です");
        await setCategoryOrder(b.names);
        return NextResponse.json({ ok: true, categoryOrder: b.names });

      case "item.reorder":
        if (!Array.isArray(b.ids)) throw new Error("並び順が必要です");
        await setItemOrder(b.ids);
        return NextResponse.json({ ok: true });

      case "item.create": {
        if (!b.name?.trim()) throw new Error("商品名を入れてください");
        if (b.price == null || b.price < 0) throw new Error("値段を入れてください");
        const it = await createItem(b.name.trim(), Math.round(b.price), b.categoryId ?? null);
        return NextResponse.json({ ok: true, item: it });
      }
      case "item.update": {
        if (!b.id) throw new Error("商品が必要です");
        await updateItem(b.id, { name: b.name?.trim(), categoryId: b.categoryId });
        return NextResponse.json({ ok: true });
      }
      case "item.price": {
        if (!b.variationId || b.price == null) throw new Error("値段が必要です");
        await updateVariationPrice(b.variationId, Math.round(b.price));
        return NextResponse.json({ ok: true });
      }
      case "item.variations": {
        if (!b.id || !Array.isArray(b.variations) || b.variations.length === 0) {
          throw new Error("種類は1つ以上必要です");
        }
        const bad = b.variations.find((v) => !v.name?.trim() || !Number.isFinite(v.price));
        if (bad) throw new Error("種類の名前と値段を入れてください");
        const vs = await updateVariations(
          b.id,
          b.variations.map((v) => ({ id: v.id, name: v.name.trim(), price: Math.round(v.price) })),
        );
        return NextResponse.json({ ok: true, variations: vs });
      }
      case "item.hidden": {
        if (!b.id) throw new Error("商品が必要です");
        const next = await setHidden(b.id, !!b.hidden);
        return NextResponse.json({ ok: true, hidden: next });
      }
      case "item.delete": {
        if (!b.id) throw new Error("商品が必要です");
        await deleteItem(b.id);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "処理に失敗" },
      { status: 500 },
    );
  }
}
