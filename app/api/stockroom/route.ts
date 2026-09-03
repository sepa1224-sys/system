import { NextRequest, NextResponse } from "next/server";
import {
  daysBetween,
  getChecks,
  getItems,
  saveCheck,
  saveItem,
  todayJST,
  type Check,
  type Item,
} from "@/lib/stockroom";
import { openOrders } from "@/lib/purchase";
import { getRecords } from "@/lib/shikomi";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET → 品目・適正在庫・前回の確認日・今日やるべきか
//   ?date=YYYY-MM-DD … その日の確認結果を品目ごとに返す（過去の確認を見る用）
export async function GET(req: NextRequest) {
  try {
    const today = todayJST();
    const [items, checks] = await Promise.all([getItems(), getChecks()]);

    // 過去の1日分。何を補充できて何が無かったかを、そのときの品目名で出す
    const want = req.nextUrl.searchParams.get("date");
    if (want) {
      const c = checks.find((x) => x.date === want);
      if (!c) return NextResponse.json({ error: `${want} の記録はありません` }, { status: 404 });
      const byId = new Map(items.map((i) => [i.id, i]));
      return NextResponse.json({
        date: c.date,
        note: c.note ?? "",
        updatedAt: c.updatedAt,
        rows: Object.entries(c.results)
          .map(([id, result]) => {
            const item = byId.get(id);
            return item
              ? { id, name: item.name, group: item.group, par: item.par, unit: item.unit, result }
              : // 今は一覧から消した品目。名前が引けないのでidだけ出す
                { id, name: id, group: "（今はない品目）", par: 0, unit: "", result };
          })
          .sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group))),
      });
    }

    const last = checks[0];
    const since = last ? daysBetween(last.date, today) : null;
    // 前回の確認で倉庫に無かったもの＝発注すべきもの
    const shortIds = last
      ? Object.entries(last.results).filter(([, v]) => v === "short").map(([k]) => k)
      : [];
    const byId = new Map(items.map((i) => [i.id, i]));

    // 発注済みでまだ届いていないもの。倉庫に無くても、もう頼んであることを
    // 在庫確認をしている本人の画面に出す。出さないと同じものをまた発注してしまう。
    const pending: Record<string, { orderedAt: string; qty: number; unit: string; days: number }> = {};
    for (const o of await openOrders()) {
      for (const l of o.lines) {
        pending[l.itemId] = {
          orderedAt: o.orderedAt,
          qty: l.qty,
          unit: l.unit,
          days: daysBetween(o.orderedAt, today),
        };
      }
    }

    // 仕込み品は「いつ仕込んだか」と「あと何日もつか」を出す。
    // 半分を切っていなくても、日持ちを過ぎていれば仕込み直す必要がある。
    const records = await getRecords();
    const madeAt: Record<string, { date: string; daysAgo: number; keepDays: number; daysLeft: number }> = {};
    for (const i of items) {
      if (!i.shikomiId || !i.keepDays) continue;
      const days = records
        .filter((r) => r.taskId === i.shikomiId)
        .map((r) => r.date)
        .sort();
      const last = days[days.length - 1];
      if (!last) continue;
      const ago = daysBetween(last, today);
      madeAt[i.id] = { date: last, daysAgo: ago, keepDays: i.keepDays, daysLeft: i.keepDays - ago };
    }

    return NextResponse.json({
      today,
      items,
      pending,
      madeAt,
      lastDate: last?.date ?? null,
      daysSince: since,
      due: since === null || since >= 3,
      shortages: shortIds.map((id) => byId.get(id)).filter(Boolean),
      history: checks.slice(0, 60).map((c) => ({
        date: c.date,
        short: Object.values(c.results).filter((v) => v === "short").length,
        total: Object.keys(c.results).length,
        note: c.note,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST
//   { item }                    … 品目・適正在庫の追加/変更（par を -1 にすると一覧から消える）
//   { check: { results, note } } … その日の確認結果を保存
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      item?: Partial<Item>;
      check?: { date?: string; results?: Record<string, "ok" | "short">; note?: string };
    };

    if (b.item) {
      if (!b.item.id || !b.item.name) {
        return NextResponse.json({ error: "idとnameが必要です" }, { status: 400 });
      }
      // 画面から送られてこない項目（発注先など）は今の値を残す。
      // 適正在庫を直しただけで発注先が消えてしまうため。
      const cur = (await getItems()).find((i) => i.id === String(b.item!.id));
      const item: Item = {
        ...cur,
        id: String(b.item.id),
        name: String(b.item.name).trim(),
        group: (b.item.group as Item["group"]) || cur?.group || "フード",
        par: Number(b.item.par ?? 0),
        unit: String(b.item.unit || cur?.unit || "個"),
        madeInHouse: b.item.madeInHouse ?? cur?.madeInHouse,
        note: b.item.note ?? cur?.note,
        ...(b.item.buyId !== undefined ? { buyId: Number(b.item.buyId) } : {}),
        ...(b.item.orderQty !== undefined ? { orderQty: Number(b.item.orderQty) } : {}),
      };
      await saveItem(item);
      return NextResponse.json({ ok: true, item });
    }

    if (b.check) {
      const c: Check = {
        date: b.check.date || todayJST(),
        results: b.check.results ?? {},
        note: b.check.note,
        updatedAt: new Date().toISOString(),
      };
      await saveCheck(c);
      const short = Object.values(c.results).filter((v) => v === "short").length;
      return NextResponse.json({ ok: true, date: c.date, short });
    }

    return NextResponse.json({ error: "itemかcheckが必要です" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
