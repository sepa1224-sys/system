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
            state_filter: { states: ["COMPLETED"] },
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

    // 注文データを整形
    const orders = allOrders.map((o) => {
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
        items: (o.line_items || []).map((li: any) => ({
          name: catalogMap[li.catalog_object_id] || li.name || "不明",
          qty: parseInt(li.quantity) || 1,
          amount: li.total_money?.amount || 0,
        })),
      };
    });

    // 集計
    const totalSales = orders.reduce((s, o) => s + o.total, 0);
    const totalTax = orders.reduce((s, o) => s + o.tax, 0);
    const orderCount = orders.length;

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
      summary: { totalSales, totalTax, orderCount },
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
