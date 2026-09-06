import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function hdrs() {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

async function locationId(): Promise<string> {
  const res = await fetch(`${SQUARE_API}/locations`, { headers: hdrs() });
  return (await res.json()).locations?.[0]?.id || "";
}

// 売上の突き合わせ。
//
// 売上ページは「注文(Orders)」から集計している。ところが実際にお金が動いたのは
// 「入金(Payments)」なので、注文が作られなかった決済や、注文の作成日と決済日が
// 日をまたいだものは、売上に出てこない。
// ここでは入金を正として、注文側に見当たらないものを洗い出す。
//
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to") || from;
    if (!from) return NextResponse.json({ error: "from が必要です" }, { status: 400 });
    const beginAt = new Date(`${from}T06:00:00+09:00`).toISOString();
    const endD = new Date(`${to}T06:00:00+09:00`);
    endD.setDate(endD.getDate() + 1);
    const endAt = endD.toISOString();
    const loc = await locationId();

    // 入金をすべて拾う
    const payments: any[] = [];
    let cursor: string | undefined;
    do {
      const u = new URL(`${SQUARE_API}/payments`);
      u.searchParams.set("begin_time", beginAt);
      u.searchParams.set("end_time", endAt);
      u.searchParams.set("location_id", loc);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      const pRes: Response = await fetch(u.toString(), { headers: hdrs() });
      const pd: any = await pRes.json();
      if (!pRes.ok) {
        return NextResponse.json(
          { error: pd.errors?.[0]?.detail || `入金の取得に失敗(${pRes.status})` },
          { status: pRes.status },
        );
      }
      payments.push(...(pd.payments || []));
      cursor = pd.cursor;
    } while (cursor);

    // 注文をすべて拾う
    const orders: any[] = [];
    cursor = undefined;
    do {
      const oRes: Response = await fetch(`${SQUARE_API}/orders/search`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({
          location_ids: [loc],
          query: {
            filter: {
              date_time_filter: { created_at: { start_at: beginAt, end_at: endAt } },
              state_filter: { states: ["COMPLETED", "OPEN"] },
            },
          },
          limit: 200,
          ...(cursor ? { cursor } : {}),
        }),
      });
      const od: any = await oRes.json();
      if (!oRes.ok) break;
      orders.push(...(od.orders || []));
      cursor = od.cursor;
    } while (cursor);

    const orderIds = new Set(orders.map((o) => o.id));
    const ok = payments.filter((p) => p.status === "COMPLETED" || p.status === "APPROVED");

    // 注文が見当たらない入金＝売上に出ていない可能性がある
    const orphan = ok.filter((p) => !p.order_id || !orderIds.has(p.order_id));

    const jst = (s: string) =>
      new Date(new Date(s).getTime() + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 16);

    return NextResponse.json({
      period: { from, to },
      payments: {
        count: ok.length,
        total: ok.reduce((s, p) => s + (p.amount_money?.amount || 0), 0),
      },
      orders: {
        count: orders.length,
        total: orders
          .filter((o) => o.state === "COMPLETED")
          .reduce((s, o) => s + (o.total_money?.amount || 0), 0),
      },
      orphan: orphan.map((p) => ({
        id: p.id,
        at: jst(p.created_at),
        amount: p.amount_money?.amount || 0,
        source: p.source_type,
        status: p.status,
        orderId: p.order_id ?? null,
        note: p.note ?? "",
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
