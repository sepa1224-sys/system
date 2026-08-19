import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function headers() {
  const token = process.env.SQUARE_ACCESS_TOKEN || "";
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function getLocationId(): Promise<string> {
  const res = await fetch(`${SQUARE_API}/locations`, { headers: headers() });
  const data = await res.json();
  return data.locations?.[0]?.id || "";
}

// カタログIDから商品名を引くためのマップを作成
async function buildCatalogMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  let cursor: string | undefined;
  do {
    const url = `${SQUARE_API}/catalog/list?types=ITEM,ITEM_VARIATION${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers: headers() });
    const data = await res.json();
    for (const obj of data.objects || []) {
      if (obj.type === "ITEM") {
        map[obj.id] = obj.item_data?.name || obj.id;
        for (const v of obj.item_data?.variations || []) {
          map[v.id] = obj.item_data?.name || v.item_variation_data?.name || v.id;
        }
      } else if (obj.type === "ITEM_VARIATION") {
        if (!map[obj.id]) {
          map[obj.id] = obj.item_variation_data?.name || obj.id;
        }
      }
    }
    cursor = data.cursor;
  } while (cursor);
  return map;
}

// GET: 売上データ取得
// query: date=YYYY-MM-DD (指定日の売上) or from=YYYY-MM-DD&to=YYYY-MM-DD (範囲)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // 日付範囲を決定（JSTベース → UTC変換）
    // 営業日は朝6時切替（6:00〜翌5:59が1日分）
    let beginAt: string;
    let endAt: string;

    if (date) {
      // 特定日: JSTの06:00〜翌日05:59
      beginAt = `${date}T06:00:00+09:00`;
      const next = new Date(`${date}T06:00:00+09:00`);
      next.setDate(next.getDate() + 1);
      endAt = next.toISOString();
    } else if (from && to) {
      beginAt = `${from}T06:00:00+09:00`;
      const next = new Date(`${to}T06:00:00+09:00`);
      next.setDate(next.getDate() + 1);
      endAt = next.toISOString();
    } else {
      // デフォルト: 今日（JST、6時切替考慮）
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      // 6時前なら前日扱い
      if (jstNow.getHours() < 6) {
        jstNow.setDate(jstNow.getDate() - 1);
      }
      const jstDate = jstNow.toISOString().slice(0, 10);
      beginAt = `${jstDate}T06:00:00+09:00`;
      const next = new Date(`${jstDate}T06:00:00+09:00`);
      next.setDate(next.getDate() + 1);
      endAt = next.toISOString();
    }

    const locationId = await getLocationId();
    if (!locationId) {
      return NextResponse.json({ error: "ロケーション未設定" }, { status: 500 });
    }

    // Square Orders API: SearchOrders
    const allOrders: any[] = [];
    let cursor: string | undefined;
    do {
      const body: any = {
        location_ids: [locationId],
        query: {
          filter: {
            date_time_filter: {
              created_at: {
                start_at: new Date(beginAt).toISOString(),
                end_at: endAt,
              },
            },
            // OPENも取る。会計をキーパッドで打つと品目の無いCOMPLETEDができ、
            // 品目つきの注文がOPENのまま残るため、あとで突き合わせて品目を補う。
            state_filter: { states: ["COMPLETED", "OPEN"] },
          },
          sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
        },
      };
      if (cursor) body.cursor = cursor;

      const res = await fetch(`${SQUARE_API}/orders/search`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        return NextResponse.json({
          error: data.errors?.[0]?.detail || `Orders API error ${res.status}`,
          details: data.errors,
        }, { status: res.status });
      }

      allOrders.push(...(data.orders || []));
      cursor = data.cursor;
    } while (cursor);

    // カタログマップを取得
    const catalogMap = await buildCatalogMap();

    // 会計されたのはCOMPLETED。OPENは品目を補うための材料として脇に置く。
    const completed = allOrders.filter((o) => o.state === "COMPLETED");
    const openOrders = allOrders.filter((o) => o.state === "OPEN");

    const named = (li: any) => catalogMap[li.catalog_object_id] || li.name || "";

    /**
     * 品目が無いCOMPLETED（キーパッド入力）に、同額・同時刻のOPEN注文の品目を当てる。
     * 会計は品目つきの注文を作った直後に打たれるので、120秒以内で探す。
     */
    const usedOpen = new Set<string>();
    function recoverItems(o: any): any[] | null {
      const hasName = (o.line_items || []).some((li: any) => named(li));
      if (hasName) return null;
      const t = new Date(o.created_at).getTime();
      const total = o.total_money?.amount || 0;
      const hit = openOrders.find(
        (x) =>
          !usedOpen.has(x.id) &&
          (x.total_money?.amount || 0) === total &&
          Math.abs(new Date(x.created_at).getTime() - t) <= 120_000,
      );
      if (!hit) return null;
      usedOpen.add(hit.id);
      return (hit.line_items || []).map((li: any) => ({
        name: named(li) || "不明",
        qty: parseInt(li.quantity) || 1,
        amount: li.total_money?.amount || 0,
        note: li.note || "",
        recovered: true,
      }));
    }

    // 注文データを整形
    const orders = completed.map((o) => {
      const createdJST = new Date(
        new Date(o.created_at).getTime() + 9 * 60 * 60 * 1000
      );
      return {
        id: o.id,
        created_at: o.created_at,
        created_jst: createdJST.toISOString().replace("T", " ").slice(0, 19),
        hour: createdJST.getHours(),
        total: o.total_money?.amount || 0,
        tax: o.total_tax_money?.amount || 0,
        // 支払方法。ドロワーを締めるとき現金の合計が要る。
        // CASH=現金、CARD=カード、OTHER=PayPay等の「その他のお支払い」
        tenders: (o.tenders || []).map((t: any) => ({
          type: t.type,
          amount: t.amount_money?.amount || 0,
          note: t.note || t.other_details?.source || "",
        })),
        items:
          recoverItems(o) ??
          (o.line_items || []).map((li: any) => ({
            name: named(li) || (li.note ? `金額入力（${li.note}）` : "金額入力"),
            qty: parseInt(li.quantity) || 1,
            amount: li.total_money?.amount || 0,
            note: li.note || "",
          })),
      };
    });

    // 集計
    const totalSales = orders.reduce((s, o) => s + o.total, 0);
    const totalTax = orders.reduce((s, o) => s + o.tax, 0);
    const orderCount = orders.length;

    // 支払方法別。Squareのドロワー（現金管理）はPOSアプリで打った分しか数えないため、
    // このアプリから現金決済したぶんは別途ここで突き合わせる必要がある。
    const byTender: Record<string, { count: number; amount: number }> = {};
    let untendered = 0;
    for (const o of orders) {
      if (!o.tenders.length) {
        untendered += o.total;
        continue;
      }
      for (const t of o.tenders) {
        const key =
          t.type === "CASH" ? "現金"
          : t.type === "CARD" ? "カード"
          : t.note || "その他";
        byTender[key] = byTender[key] || { count: 0, amount: 0 };
        byTender[key].count += 1;
        byTender[key].amount += t.amount;
      }
    }
    const cashTotal = byTender["現金"]?.amount || 0;

    // 商品別集計
    const productMap: Record<string, { qty: number; amount: number }> = {};
    for (const o of orders) {
      for (const item of o.items) {
        if (!productMap[item.name]) productMap[item.name] = { qty: 0, amount: 0 };
        productMap[item.name].qty += item.qty;
        productMap[item.name].amount += item.amount;
      }
    }
    const byProduct = Object.entries(productMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.amount - a.amount);

    // 時間帯別集計
    const hourlyMap: Record<number, { count: number; amount: number }> = {};
    for (const o of orders) {
      if (!hourlyMap[o.hour]) hourlyMap[o.hour] = { count: 0, amount: 0 };
      hourlyMap[o.hour].count++;
      hourlyMap[o.hour].amount += o.total;
    }
    const byHour = Object.entries(hourlyMap)
      .map(([h, v]) => ({ hour: parseInt(h), ...v }))
      .sort((a, b) => a.hour - b.hour);

    return NextResponse.json({
      period: { begin: beginAt, end: endAt },
      summary: { totalSales, totalTax, orderCount, cashTotal, untendered },
      byTender,
      byProduct,
      byHour,
      orders,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "売上データ取得失敗" },
      { status: 500 }
    );
  }
}
