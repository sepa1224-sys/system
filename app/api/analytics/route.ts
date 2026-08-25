import { NextRequest, NextResponse } from "next/server";
import { EXCLUDE_WINDOWS, excludeOf } from "@/lib/salesEvents";
import { getReceipts, receiptLines } from "@/lib/receipts";
import { getMenuItems } from "@/lib/menu";

export const runtime = "nodejs";
export const maxDuration = 60;

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function hdrs() {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

async function getLocationId(): Promise<string> {
  const res = await fetch(`${SQUARE_API}/locations`, { headers: hdrs() });
  const data = await res.json();
  return data.locations?.[0]?.id || "";
}

// 指定期間のCOMPLETED注文をSquareから全件取得
async function fetchOrders(beginISO: string, endISO: string) {
  const locationId = await getLocationId();
  if (!locationId) return [];
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const body: any = {
      location_ids: [locationId],
      query: {
        filter: {
          date_time_filter: { created_at: { start_at: beginISO, end_at: endISO } },
          state_filter: { states: ["COMPLETED"] },
        },
        sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
      },
    };
    if (cursor) body.cursor = cursor;
    const res = await fetch(`${SQUARE_API}/orders/search`, {
      method: "POST", headers: hdrs(), body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) break;
    all.push(...(data.orders || []));
    cursor = data.cursor;
  } while (cursor);
  return all;
}

// GET /api/analytics?from=2026-08-01&to=2026-08-15&withEvents=1
//   withEvents=1 を付けると通常営業でない日も混ぜる。既定では外して平常日だけを見る。
// 売上（Square）・支出（領収書）・商品別粗利（原価表と突き合わせ）を一括で返す。
// 経営判断用。freeeに登録済みかどうかは問わず、領収書の全件を支出として扱う。
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const from = searchParams.get("from") || today.slice(0, 8) + "01";
    const to = searchParams.get("to") || today;
    // 既定では通常営業でない日を外す。傾向を見るのが目的のため
    const withEvents = searchParams.get("withEvents") === "1";

    // 営業日は朝6時切替
    const beginISO = new Date(`${from}T06:00:00+09:00`).toISOString();
    const endD = new Date(`${to}T06:00:00+09:00`);
    endD.setDate(endD.getDate() + 1);
    const endISO = endD.toISOString();

    const [orders, receipts, menu] = await Promise.all([
      fetchOrders(beginISO, endISO),
      getReceipts(),
      getMenuItems(),
    ]);

    // ── 売上side ──────────────────────────────
    // カタログID→原価のマップ（バリエーション名は追えないので商品名で引く）
    const costByName: Record<string, number> = {};
    for (const m of menu) costByName[m.name] = m.cost;

    let totalSales = 0, totalTax = 0;
    const byDay: Record<string, { sales: number; count: number }> = {};
    const byProduct: Record<string, { qty: number; amount: number; cost: number }> = {};
    const byTender: Record<string, { count: number; amount: number }> = {};
    // 時間帯別・曜日別（バイトのシフトをどこに入れるかの判断材料）。
    // 「営業した日数」で割って1日平均を出すため、時間帯ごとに日付も集める。
    const byHour: Record<number, { sales: number; count: number; days: Set<string> }> = {};
    const byWeekday: Record<number, { sales: number; count: number; days: Set<string> }> = {};
    const byMonth: Record<string, { sales: number; count: number; days: Set<string> }> = {};
    // 外したイベント分。除外した額が分かるように別で持つ
    const eventSales: Record<string, { sales: number; count: number; reason: string }> = {};

    for (const o of orders) {
      const amt = o.total_money?.amount || 0;
      const jst = new Date(new Date(o.created_at).getTime() + 9 * 3600_000);
      // 6時前は前営業日に付ける
      if (jst.getUTCHours() < 6) jst.setUTCDate(jst.getUTCDate() - 1);
      const day = jst.toISOString().slice(0, 10);

      // 実際の時刻（営業日への繰り上げ前の時刻を使う。25時台は1時として扱う）
      const realJst = new Date(new Date(o.created_at).getTime() + 9 * 3600_000);
      const hour = realJst.getUTCHours();

      const ex = excludeOf(day, hour);
      if (ex && !withEvents) {
        const k = ex.label;
        eventSales[k] = eventSales[k] || { sales: 0, count: 0, reason: ex.reason };
        eventSales[k].sales += amt;
        eventSales[k].count += 1;
        continue; // 平常日の集計には入れない
      }

      totalSales += amt;
      totalTax += o.total_tax_money?.amount || 0;

      byDay[day] = byDay[day] || { sales: 0, count: 0 };
      byDay[day].sales += amt;
      byDay[day].count += 1;
      byHour[hour] = byHour[hour] || { sales: 0, count: 0, days: new Set() };
      byHour[hour].sales += amt;
      byHour[hour].count += 1;
      byHour[hour].days.add(day);

      const wd = new Date(day + "T00:00:00Z").getUTCDay(); // 0=日
      byWeekday[wd] = byWeekday[wd] || { sales: 0, count: 0, days: new Set() };
      byWeekday[wd].sales += amt;
      byWeekday[wd].count += 1;
      byWeekday[wd].days.add(day);

      const mon = day.slice(0, 7);
      byMonth[mon] = byMonth[mon] || { sales: 0, count: 0, days: new Set() };
      byMonth[mon].sales += amt;
      byMonth[mon].count += 1;
      byMonth[mon].days.add(day);

      for (const li of o.line_items || []) {
        const name = li.name || "不明";
        const qty = parseInt(li.quantity) || 1;
        byProduct[name] = byProduct[name] || { qty: 0, amount: 0, cost: 0 };
        byProduct[name].qty += qty;
        byProduct[name].amount += li.total_money?.amount || 0;
        byProduct[name].cost += (costByName[name] || 0) * qty;
      }
      for (const t of o.tenders || []) {
        const key = t.type === "CASH" ? "現金" : t.type === "CARD" ? "カード"
          : t.note || t.other_details?.source || "その他";
        byTender[key] = byTender[key] || { count: 0, amount: 0 };
        byTender[key].count += 1;
        byTender[key].amount += t.amount_money?.amount || 0;
      }
    }

    // ── 支出side（領収書）─────────────────────
    // 期間内の領収書を科目・用途タグで集計
    const inRange = receipts.filter((r) => r.date >= from && r.date <= to);
    let totalExpense = 0, cogs = 0;
    const byCategory: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    for (const r of inRange) {
      for (const l of receiptLines(r)) {
        const a = l.amount || 0;
        totalExpense += a;
        const cat = l.category || "不明";
        byCategory[cat] = (byCategory[cat] || 0) + a;
        if (cat === "仕入高") cogs += a;
        for (const t of l.tags || []) byTag[t] = (byTag[t] || 0) + a;
      }
    }

    // ── 商品別粗利（原価表に載っているものだけ原価が付く）──
    const products = Object.entries(byProduct)
      .map(([name, v]) => ({
        name, qty: v.qty, amount: v.amount,
        cost: Math.round(v.cost),
        gross: v.amount - Math.round(v.cost),
        rate: v.amount ? Math.round((v.cost / v.amount) * 1000) / 10 : null,
        hasCost: costByName[name] !== undefined,
      }))
      .sort((a, b) => b.amount - a.amount);

    const knownCost = products.filter((p) => p.hasCost).reduce((s, p) => s + p.cost, 0);
    const knownSales = products.filter((p) => p.hasCost).reduce((s, p) => s + p.amount, 0);
    const unknownSales = totalSales - knownSales;

    return NextResponse.json({
      period: { from, to },
      // 分析から外した日。withEvents=1 を付けると混ぜて集計する
      excludedEvents: {
        applied: !withEvents,
        windows: EXCLUDE_WINDOWS,
        sales: Object.entries(eventSales).map(([label, v]) => ({ label, ...v })),
        total: Object.values(eventSales).reduce((n, v) => n + v.sales, 0),
      },
      sales: {
        total: totalSales,
        tax: totalTax,
        orderCount: orders.length,
        byDay: Object.entries(byDay).sort().map(([day, v]) => ({ day, ...v })),
        // 月別（1日あたりの平均も出す。月をまたいで比べるため）
        byMonth: Object.entries(byMonth)
          .sort()
          .map(([month, v]) => ({
            month,
            sales: v.sales,
            count: v.count,
            days: v.days.size,
            perDay: Math.round(v.sales / v.days.size),
          })),
        byTender: Object.entries(byTender)
          .map(([k, v]) => ({ tender: k, ...v }))
          .sort((a, b) => b.amount - a.amount),
        // 時間帯別（1日あたりの平均も出す。シフトを何時に置くかの判断用）
        byHour: Object.entries(byHour)
          .map(([h, v]) => ({
            hour: Number(h),
            sales: v.sales,
            count: v.count,
            days: v.days.size,
            avgSales: Math.round(v.sales / v.days.size),
            avgCount: Math.round((v.count / v.days.size) * 10) / 10,
          }))
          .sort((a, b) => a.hour - b.hour),
        byWeekday: Object.entries(byWeekday)
          .map(([w, v]) => ({
            weekday: Number(w),
            name: ["日", "月", "火", "水", "木", "金", "土"][Number(w)],
            sales: v.sales,
            count: v.count,
            days: v.days.size,
            avgSales: Math.round(v.sales / v.days.size),
          }))
          .sort((a, b) => a.weekday - b.weekday),
      },
      products,
      productCostCoverage: {
        // 原価表と突き合わせできた売上の割合。低いとき粗利は当てにならない
        knownSales, unknownSales, knownCost,
        estGross: knownSales - knownCost,
      },
      expenses: {
        total: totalExpense,
        cogs,
        receiptCount: inRange.length,
        byCategory: Object.entries(byCategory)
          .map(([k, v]) => ({ category: k, amount: v }))
          .sort((a, b) => b.amount - a.amount),
        byTag: Object.entries(byTag)
          .map(([k, v]) => ({ tag: k, amount: v }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 15),
      },
      pnl: {
        sales: totalSales,
        // 商品原価は「原価表ベースの理論値」、仕入高は「実際に買った額」。
        // 開業期は仕入が先行するため両方を出す。
        theoreticalCogs: knownCost,
        actualPurchases: cogs,
        otherExpenses: totalExpense - cogs,
        grossByTheory: totalSales - knownCost,
        cashFlow: totalSales - totalExpense,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "集計に失敗" },
      { status: 500 },
    );
  }
}
