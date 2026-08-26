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

export const runtime = "nodejs";
export const maxDuration = 60;

// GET → 品目・適正在庫・前回の確認日・今日やるべきか
export async function GET() {
  try {
    const today = todayJST();
    const [items, checks] = await Promise.all([getItems(), getChecks()]);
    const last = checks[0];
    const since = last ? daysBetween(last.date, today) : null;
    // 前回の確認で倉庫に無かったもの＝発注すべきもの
    const shortIds = last
      ? Object.entries(last.results).filter(([, v]) => v === "short").map(([k]) => k)
      : [];
    const byId = new Map(items.map((i) => [i.id, i]));
    return NextResponse.json({
      today,
      items,
      lastDate: last?.date ?? null,
      daysSince: since,
      due: since === null || since >= 3,
      shortages: shortIds.map((id) => byId.get(id)).filter(Boolean),
      history: checks.slice(0, 10).map((c) => ({
        date: c.date,
        short: Object.values(c.results).filter((v) => v === "short").length,
        total: Object.keys(c.results).length,
        note: c.note,
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
      const item: Item = {
        id: String(b.item.id),
        name: String(b.item.name).trim(),
        group: (b.item.group as Item["group"]) || "フード",
        par: Number(b.item.par ?? 0),
        unit: String(b.item.unit || "個"),
        madeInHouse: b.item.madeInHouse,
        note: b.item.note,
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
